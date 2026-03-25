const express  = require("express");
const passport = require("passport");
const jwt      = require("jsonwebtoken");
const bcrypt   = require("bcryptjs");
const User     = require("../models/User");
const verifyJWT = require("../middleware/verifyJWT");
const { authorizeRoles } = require("../middleware/authorizeRoles");
const {
  signAccess, signRefresh, persistRefresh,
  revokeRefresh, revokeAllForUser, isRefreshValid,
  decodeExp, newJti,
} = require("../auth/tokens");
const {
  recordFailure, resetFailures, isLocked, lockRemainingMs,
} = require("../security/bruteforce");

const createAuthRoutes = (JWT_SECRET, {
  limiters,
  csrfKit,
  csrfHeader = "x-csrf-token",
  redisClient = null,
} = {}) => {
  const router           = express.Router();
  const credentialLimiter = limiters?.credentialLimiter || limiters?.authLimiter;
  const tokenLimiter      = limiters?.tokenLimiter      || limiters?.authLimiter;
  const authSlowdown      = limiters?.authSlowdown;
  const jwtMiddleware     = verifyJWT(JWT_SECRET, { redisClient });

  // ── Helper: issue tokens ──────────────────────────────────────────────────
  async function issueTokensForUser(req, res, user) {
    const roles = Array.isArray(user?.roles) && user.roles.length ? user.roles : ["user"];
    const accessToken = signAccess(
      { id: user._id, name: user.name, profilePic: user.profilePic, tokenVersion: user.tokenVersion, roles },
      JWT_SECRET
    );
    const jti          = newJti();
    const refreshToken = signRefresh({ id: user._id, tokenVersion: user.tokenVersion, roles }, JWT_SECRET, jti);
    const exp          = decodeExp(refreshToken);
    await persistRefresh(user._id, refreshToken, jti, exp);
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      sameSite: "strict",
      secure:   process.env.NODE_ENV === "production",
      path:     "/auth",
      maxAge:   30 * 24 * 60 * 60 * 1000,
    });
    // Only access token in body — refresh token stays in httpOnly cookie
    res.json({ accessToken, roles });
  }

  // ── CSRF ──────────────────────────────────────────────────────────────────
  router.get("/csrf", (req, res) => {
    const token = csrfKit?.generateToken ? csrfKit.generateToken(req, res, true) : null;
    if (token) res.set(csrfHeader, token);
    res.json({ csrfToken: token, header: csrfHeader });
  });

  // ── LOCAL REGISTER ────────────────────────────────────────────────────────
  router.post("/register", credentialLimiter, authSlowdown, async (req, res) => {
    try {
      const { name, email, password } = req.body;
      if (!email || !password)
        return res.status(400).json({ error: "Email and password are required." });
      if (password.length < 8)
        return res.status(400).json({ error: "Password must be at least 8 characters." });
      const existing = await User.findOne({ email: email.toLowerCase().trim() });
      if (existing)
        return res.status(409).json({ error: "An account with this email already exists." });
      const user = await User.create({
        name:  name?.trim() || "",
        email: email.toLowerCase().trim(),
        password,
        roles: ["user"],
      });
      return issueTokensForUser(req, res, user);
    } catch (err) {
      console.error("[register]", err);
      return res.status(500).json({ error: "Registration failed." });
    }
  });

  // ── LOCAL LOGIN ───────────────────────────────────────────────────────────
  router.post("/login", credentialLimiter, authSlowdown, async (req, res, next) => {
    const ip       = req.ip;
    const username = req.body?.email || "";
    if (await isLocked(ip, username, redisClient)) {
      const ms = await lockRemainingMs(ip, username, redisClient);
      return res.status(429).json({
        error: `Account temporarily locked. Try again in ${Math.ceil(ms / 60000)} minute(s).`,
      });
    }
    passport.authenticate("local", async (err, user, info) => {
      if (err) return next(err);
      if (!user) {
        await recordFailure(ip, username, redisClient);
        return res.status(401).json({ error: info?.message || "Invalid credentials." });
      }
      await resetFailures(ip, username, redisClient);
      return issueTokensForUser(req, res, user);
    })(req, res, next);
  });

  // ── GOOGLE OAuth ──────────────────────────────────────────────────────────
  router.get("/google", credentialLimiter, authSlowdown,
    passport.authenticate("google", { scope: ["profile", "email"] })
  );
  router.get("/google/callback", credentialLimiter,
    passport.authenticate("google", { failureRedirect: "/auth/failure" }),
    async (req, res) => {
      try {
        const user = await User.findById(req.user._id).lean();
        return issueTokensForUser(req, res, user);
      } catch (err) {
        console.error("[google/callback]", err);
        return res.status(500).json({ error: "OAuth callback failed." });
      }
    }
  );

  router.get("/failure", (_req, res) =>
    res.status(401).json({ error: "Authentication failed." })
  );

  // ── Protected (any authenticated user) ───────────────────────────────────
  router.get("/protected", jwtMiddleware, (req, res) => {
    res.json({ message: "Token is valid", user: req.user });
  });

  // ── Admin-only ────────────────────────────────────────────────────────────
  router.get("/admin", jwtMiddleware, authorizeRoles(["admin"]), (req, res) => {
    res.json({ message: "Welcome, admin!", user: req.user });
  });

  // ── /auth/me ──────────────────────────────────────────────────────────────
  router.get("/me", jwtMiddleware, async (req, res) => {
    try {
      const user = await User.findById(req.user.id).lean();
      if (!user) return res.status(404).json({ error: "User not found." });
      const { password: _p, ...safe } = user;
      res.json(safe);
    } catch {
      res.status(500).json({ error: "Failed to fetch user." });
    }
  });

  // ── Refresh token rotation ────────────────────────────────────────────────
  router.post("/refresh", tokenLimiter, async (req, res) => {
    try {
      const token = req.cookies?.refreshToken || req.body?.refreshToken;
      if (!token) return res.status(401).json({ error: "No refresh token provided." });
      const decoded = jwt.verify(token, JWT_SECRET);
      const { jti } = decoded;
      if (!jti) return res.status(401).json({ error: "Malformed refresh token." });
      const valid = await isRefreshValid(token, jti);
      if (!valid) return res.status(401).json({ error: "Invalid or revoked refresh token." });
      await revokeRefresh(jti);
      const nextJti = newJti();
      const roles   = Array.isArray(decoded.roles) && decoded.roles.length ? decoded.roles : ["user"];
      const accessToken = signAccess({ id: decoded.id, tokenVersion: decoded.tokenVersion, roles }, JWT_SECRET);
      const nextRefresh = signRefresh({ id: decoded.id, tokenVersion: decoded.tokenVersion, roles }, JWT_SECRET, nextJti);
      const exp = decodeExp(nextRefresh);
      await persistRefresh(decoded.id, nextRefresh, nextJti, exp);
      res.cookie("refreshToken", nextRefresh, {
        httpOnly: true,
        sameSite: "strict",
        secure:   process.env.NODE_ENV === "production",
        path:     "/auth",
        maxAge:   30 * 24 * 60 * 60 * 1000,
      });
      res.json({ accessToken });
    } catch {
      return res.status(401).json({ error: "Refresh token verification failed." });
    }
  });

  // ── Logout ────────────────────────────────────────────────────────────────
  router.get("/logout", async (req, res) => {
    try {
      const cookieToken = req.cookies?.refreshToken;
      if (cookieToken) {
        const decoded = jwt.decode(cookieToken);
        if (decoded?.jti) await revokeRefresh(decoded.jti);
      }
    } catch (_) { /* ignore */ }
    req.logout(() => {
      req.session.destroy((err) => {
        if (err) return res.status(500).json({ error: "Logout failed." });
        res.clearCookie("connect.sid");
        res.clearCookie("refreshToken", { path: "/auth" });
        res.json({ message: "Logged out successfully." });
      });
    });
  });

  // ── Logout all devices ────────────────────────────────────────────────────
  router.post("/logout-all", tokenLimiter, jwtMiddleware, async (req, res) => {
    try {
      const user = await User.findById(req.user.id);
      if (!user) return res.status(404).json({ error: "User not found." });
      user.tokenVersion += 1;
      await user.save();
      await revokeAllForUser(user._id);
      res.clearCookie("refreshToken", { path: "/auth" });
      res.json({ message: "Logged out from all devices." });
    } catch {
      res.status(500).json({ error: "Logout-all failed." });
    }
  });

  return router;
};

module.exports = createAuthRoutes;
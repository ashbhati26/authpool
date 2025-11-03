const express = require("express");
const passport = require("passport");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const verifyJWT = require("../middleware/verifyJWT");
const { authorizeRoles } = require("../middleware/authorizeRoles");
const {
  signAccess,
  signRefresh,
  persistRefresh,
  revokeRefresh,
  revokeAllForUser,
  isRefreshValid,
  decodeExp,
  newJti,
} = require("../auth/tokens");

/**
 * @param {string} JWT_SECRET
 * @param {{ limiters?: { authLimiter: Function, authSlowdown: Function }, csrfHeader?: string }} opts
 */
const createAuthRoutes = (JWT_SECRET, { limiters, csrfHeader = "x-csrf-token" } = {}) => {
  const router = express.Router();
  const authLimiter = limiters?.authLimiter;
  const authSlowdown = limiters?.authSlowdown;

  // CSRF helper
  router.get("/csrf", (req, res) => {
    const token = typeof req.csrfToken === "function" ? req.csrfToken() : null;
    if (token) res.set(csrfHeader, token);
    res.json({ csrfToken: token, header: csrfHeader });
  });

  // ===== GOOGLE =====
  router.get("/google", authLimiter, authSlowdown,
    passport.authenticate("google", { scope: ["profile", "email"] })
  );

  router.get("/google/callback", authLimiter, authSlowdown,
    passport.authenticate("google", { failureRedirect: "/auth/failure" }),
    async (req, res) => issueTokensForUser(req, res, JWT_SECRET)
  );

  // ===== (if you enabled them) GITHUB / FACEBOOK =====
  router.get("/github", authLimiter, authSlowdown,
    passport.authenticate("github", { scope: ["user:email"] })
  );
  router.get("/github/callback", authLimiter, authSlowdown,
    passport.authenticate("github", { failureRedirect: "/auth/failure" }),
    async (req, res) => issueTokensForUser(req, res, JWT_SECRET)
  );

  router.get("/facebook", authLimiter, authSlowdown,
    passport.authenticate("facebook", { scope: ["email"] })
  );
  router.get("/facebook/callback", authLimiter, authSlowdown,
    passport.authenticate("facebook", { failureRedirect: "/auth/failure" }),
    async (req, res) => issueTokensForUser(req, res, JWT_SECRET)
  );

  // Common token issuing path used by all provider callbacks
  async function issueTokensForUser(req, res, secret) {
    const user = await User.findById(req.user._id).lean();
    const roles = Array.isArray(user?.roles) && user.roles.length ? user.roles : ["user"];

    const accessToken = signAccess(
      {
        id: user._id,
        name: user.name,
        profilePic: user.profilePic,
        tokenVersion: user.tokenVersion,
        roles,
      },
      secret
    );

    const jti = newJti();
    const refreshToken = signRefresh(
      {
        id: user._id,
        tokenVersion: user.tokenVersion,
        roles,
      },
      secret,
      jti
    );
    const exp = decodeExp(refreshToken);
    await persistRefresh(user._id, refreshToken, jti, exp);

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/auth",
    });

    res.json({ accessToken, refreshToken, roles });
  }

  router.get("/failure", (req, res) => res.status(401).json({ error: "Authentication Failed" }));

  // JWT protected route (any authenticated user)
  router.get("/protected", authLimiter, verifyJWT(JWT_SECRET), (req, res) => {
    res.json({ message: "Token is valid", user: req.user });
  });

  // EXAMPLE: Admin-only route
  router.get("/admin", authLimiter, verifyJWT(JWT_SECRET), authorizeRoles(["admin"]), (req, res) => {
    res.json({ message: "Welcome, admin!", user: req.user });
  });

  // Refresh endpoint -> rotate refresh token + return new access token
  router.post("/refresh", authLimiter, authSlowdown, async (req, res) => {
    try {
      const tokenFromCookie = req.cookies?.refreshToken;
      const tokenFromBody = req.body?.refreshToken;
      const token = tokenFromCookie || tokenFromBody;
      if (!token) return res.status(401).json({ error: "No refresh token provided" });

      const decoded = jwt.verify(token, JWT_SECRET); // includes jti and roles
      const jti = decoded.jti;
      if (!jti) return res.status(401).json({ error: "Malformed refresh token" });

      const valid = await isRefreshValid(token, jti);
      if (!valid) return res.status(401).json({ error: "Invalid or revoked refresh token" });

      // Rotate: revoke current, issue new pair
      await revokeRefresh(jti);
      const nextJti = newJti();

      // Use roles from the refresh token (reflect changes on next login or tokenVersion bump)
      const roles = Array.isArray(decoded.roles) && decoded.roles.length ? decoded.roles : ["user"];

      const accessToken = signAccess(
        { id: decoded.id, tokenVersion: decoded.tokenVersion, roles },
        JWT_SECRET
      );
      const nextRefresh = signRefresh(
        { id: decoded.id, tokenVersion: decoded.tokenVersion, roles },
        JWT_SECRET,
        nextJti
      );
      const exp = decodeExp(nextRefresh);
      await persistRefresh(decoded.id, nextRefresh, nextJti, exp);

      res.cookie("refreshToken", nextRefresh, {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        path: "/auth",
      });

      res.json({ accessToken });
    } catch (err) {
      return res.status(401).json({ error: "Refresh token verification failed" });
    }
  });

  router.get("/logout", authLimiter, authSlowdown, async (req, res) => {
    try {
      const cookieToken = req.cookies?.refreshToken;
      if (cookieToken) {
        const decoded = jwt.decode(cookieToken);
        if (decoded?.jti) await revokeRefresh(decoded.jti);
      }
    } catch (_) {}
    req.logout(() => {
      req.session.destroy((err) => {
        if (err) return res.status(500).json({ error: "Logout failed" });
        res.clearCookie("connect.sid");
        res.clearCookie("refreshToken", { path: "/auth" });
        res.json({ message: "Logged out successfully" });
      });
    });
  });

  router.post("/logout-all", authLimiter, authSlowdown, async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }
    const token = authHeader.split(" ")[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await User.findById(decoded.id);
      if (!user) return res.status(404).json({ error: "User not found" });

      user.tokenVersion += 1;
      await user.save();
      await revokeAllForUser(user._id);

      res.clearCookie("refreshToken", { path: "/auth" });
      res.json({ message: "Logged out from all devices" });
    } catch (err) {
      res.status(401).json({ error: "Token is invalid or expired" });
    }
  });

  return router;
};

module.exports = createAuthRoutes;

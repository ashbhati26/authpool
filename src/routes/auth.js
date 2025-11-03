const express = require("express");
const passport = require("passport");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/User");
const verifyJWT = require("../middleware/verifyJWT");
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

  // CSRF token fetch (JSON helper) — header also set by sendTokenHeader middleware on GET
  router.get("/csrf", (req, res) => {
    const token = typeof req.csrfToken === "function" ? req.csrfToken() : null;
    if (token) res.set(csrfHeader, token);
    res.json({ csrfToken: token, header: csrfHeader });
  });

  // Google OAuth login
  router.get(
    "/google",
    authLimiter,
    authSlowdown,
    passport.authenticate("google", { scope: ["profile", "email"] })
  );

  // Google OAuth callback -> issue access + refresh, persist refresh, set cookie
  router.get(
    "/google/callback",
    authLimiter,
    authSlowdown,
    passport.authenticate("google", { failureRedirect: "/auth/failure" }),
    async (req, res) => {
      const user = req.user;

      // access token (short)
      const accessToken = signAccess(
        { id: user._id, name: user.name, profilePic: user.profilePic, tokenVersion: user.tokenVersion },
        JWT_SECRET
      );

      // refresh token (long) + persistence
      const jti = newJti();
      const refreshToken = signRefresh({ id: user._id, tokenVersion: user.tokenVersion }, JWT_SECRET, jti);
      const exp = decodeExp(refreshToken);
      await persistRefresh(user._id, refreshToken, jti, exp);

      // Set httpOnly cookie for refresh; also return in body for Postman testing
      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        path: "/auth",
      });

      res.json({ accessToken, refreshToken }); // include refreshToken for easier testing
    }
  );

  // Auth failure fallback
  router.get("/failure", (req, res) => {
    res.status(401).json({ error: "Authentication Failed" });
  });

  // JWT protected route
  router.get("/protected", authLimiter, verifyJWT(JWT_SECRET), (req, res) => {
    res.json({ message: "Token is valid", user: req.user });
  });

  // Refresh endpoint -> rotate refresh token + return new access token
  router.post("/refresh", authLimiter, authSlowdown, async (req, res) => {
    try {
      const tokenFromCookie = req.cookies?.refreshToken;
      const tokenFromBody = req.body?.refreshToken;
      const token = tokenFromCookie || tokenFromBody;
      if (!token) return res.status(401).json({ error: "No refresh token provided" });

      const decoded = jwt.verify(token, JWT_SECRET); // includes jti
      const jti = decoded.jti;
      if (!jti) return res.status(401).json({ error: "Malformed refresh token" });

      const valid = await isRefreshValid(token, jti);
      if (!valid) return res.status(401).json({ error: "Invalid or revoked refresh token" });

      // Rotate: revoke current, issue new pair
      await revokeRefresh(jti);
      const nextJti = newJti();

      const accessToken = signAccess(
        { id: decoded.id, tokenVersion: decoded.tokenVersion },
        JWT_SECRET
      );
      const nextRefresh = signRefresh(
        { id: decoded.id, tokenVersion: decoded.tokenVersion },
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

  // Logout single session — clear current refresh cookie if present (defensive revoke)
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
        if (err) {
          return res.status(500).json({ error: "Logout failed" });
        }
        res.clearCookie("connect.sid");
        res.clearCookie("refreshToken", { path: "/auth" });
        res.json({ message: "Logged out successfully" });
      });
    });
  });

  // Logout from all devices — bump tokenVersion and revoke all refresh tokens
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

      // Invalidate all issued access tokens (by bumping version) & revoke refresh tokens in DB
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

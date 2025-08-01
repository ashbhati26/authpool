const express = require("express");
const passport = require("passport");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const createAuthRoutes = (JWT_SECRET) => {
  const router = express.Router();

  // Google OAuth login
  router.get(
    "/google",
    passport.authenticate("google", { scope: ["profile", "email"] })
  );

  // Google OAuth callback
  router.get(
    "/google/callback",
    passport.authenticate("google", { failureRedirect: "/auth/failure" }),
    async (req, res) => {
      const user = req.user;
      const token = jwt.sign(
        {
          id: user._id,
          name: user.name,
          profilePic: user.profilePic,
          tokenVersion: user.tokenVersion,
        },
        JWT_SECRET,
        { expiresIn: "7d" }
      );
      res.json({ token });
    }
  );

  // Auth failure fallback
  router.get("/failure", (req, res) => {
    res.status(401).json({ error: "Authentication Failed" });
  });

  // JWT protected route
  router.get("/protected", async (req, res) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.split(" ")[1];

    try {
      const decoded = jwt.verify(token, JWT_SECRET);

      const user = await User.findById(decoded.id);
      if (!user || user.tokenVersion !== decoded.tokenVersion) {
        return res.status(401).json({ error: "Token has been invalidated" });
      }

      res.json({ message: "Token is valid", user: decoded });
    } catch (err) {
      res.status(401).json({ error: "Token is invalid" });
    }
  });

  // Logout single session
  router.get("/logout", (req, res) => {
    req.logout(() => {
      req.session.destroy((err) => {
        if (err) {
          return res.status(500).json({ error: "Logout failed" });
        }
        res.clearCookie("connect.sid");
        res.json({ message: "Logged out successfully" });
      });
    });
  });

  // Logout from all devices
  router.post("/logout-all", async (req, res) => {
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

      res.json({ message: "Logged out from all devices" });
    } catch (err) {
      res.status(401).json({ error: "Token is invalid or expired" });
    }
  });

  return router;
};

module.exports = createAuthRoutes;

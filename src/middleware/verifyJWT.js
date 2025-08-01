const jwt = require("jsonwebtoken");
const User = require("../models/User");

const verifyJWT = (JWT_SECRET) => {
  return async (req, res, next) => {
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

      req.user = decoded;
      next();
    } catch (err) {
      res.status(401).json({ error: "Token is invalid or expired" });
    }
  };
};

module.exports = verifyJWT;

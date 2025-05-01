const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken');

const createAuthRoutes = (JWT_SECRET) => {
  const router = express.Router(); 

  router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

  router.get('/google/callback',
    passport.authenticate('google', { failureRedirect: '/auth/failure' }),
    (req, res) => {
      const user = req.user;
      const token = jwt.sign(
        { id: user._id, name: user.name, profilePic: user.profilePic },
        JWT_SECRET,
        { expiresIn: '7d' }
      );
      res.json({ token });
    }
  );

  router.get('/failure', (req, res) => {
    res.status(401).json({ error: "Authentication Failed" });
  });

  router.get('/protected', (req, res) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      res.json({ message: 'Token is valid', user: decoded });
    } catch (err) {
      res.status(401).json({ error: 'Token is invalid' });
    }
  });

  return router;
};

module.exports = createAuthRoutes; // ✅ Proper export

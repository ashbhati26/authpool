const express = require('express');
const session = require('express-session');
const passport = require('passport');
const mongoose = require('mongoose');
const initPassport = require('./src/config/passport');
const createAuthRoutes = require('./src/routes/auth');
require('dotenv').config();

let app;

const startAuthServer = async ({
  mongoURI,
  googleClientID,
  googleClientSecret,
  googleCallbackURL,
  jwtSecret,
  sessionSecret,
  port = 5000,
}) => {
  app = express();

  await mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error(err));


  initPassport(googleClientID, googleClientSecret, googleCallbackURL);

  app.use(session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: true
  }));

  app.use(passport.initialize());
  app.use(passport.session());

  app.use('/auth', createAuthRoutes(jwtSecret));

  app.get('/', (req, res) => res.send('Google Auth Package Running'));

  app.listen(port, () => console.log(`Auth server running at http://localhost:${port}`));
};

module.exports = { startAuthServer };

const express = require("express");
const session = require("express-session");
const passport = require("passport");
const mongoose = require("mongoose");
const cors = require("cors");
const initPassport = require("./src/config/passport");
const createAuthRoutes = require("./src/routes/auth");
require("dotenv").config();

let app;

const startAuthServer = async ({
  mongoURI,
  googleClientID,
  googleClientSecret,
  googleCallbackURL,
  jwtSecret,
  sessionSecret,
  port = 5000,
  corsOptions = {},
}) => {
  app = express();

  // MongoDB Connection
  await mongoose
    .connect(mongoURI)
    .then(() => console.log("MongoDB connected"))
    .catch((err) => {
      console.error('MongoDB connection failed:', err);
      process.exit(1);
    });

  // Passport Initialization
  initPassport(googleClientID, googleClientSecret, googleCallbackURL);

  // CORS Setup
  app.use(
    cors({
      origin: corsOptions.origin || "*",
      methods: corsOptions.methods || ["GET", "POST"],
      allowedHeaders: corsOptions.allowedHeaders || [
        "Content-Type",
        "Authorization",
      ],
      credentials: corsOptions.credentials ?? true,
    })
  );

  // Express Session
  app.use(
    session({
      secret: sessionSecret,
      resave: false,
      saveUninitialized: true,
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  // Routes
  app.use("/auth", createAuthRoutes(jwtSecret));

  // Root Test
  app.get("/", (req, res) =>
    res.send("Google Auth Package Running with CORS Support")
  );

  // Start Server
  app.listen(port, () =>
    console.log(`Auth server running at http://localhost:${port}`)
  );
};

module.exports = { startAuthServer };

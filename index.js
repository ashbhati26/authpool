const express = require("express");
const session = require("express-session");
const passport = require("passport");
const mongoose = require("mongoose");
const cors = require("cors");

const initPassport = require("./src/config/passport");
const createAuthRoutes = require("./src/routes/auth");
const { resolveConfig } = require("./src/config/env");

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
} = {}) => {
  app = express();

  // 1) Resolve & validate configuration (from args or env)
  const cfg = resolveConfig({
    mongoURI,
    googleClientID,
    googleClientSecret,
    googleCallbackURL,
    jwtSecret,
    sessionSecret,
    port,
    corsOptions,
  });

  // 2) Connect MongoDB
  await mongoose
    .connect(cfg.MONGO_URI)
    .then(() => console.log("MongoDB connected"))
    .catch((err) => {
      console.error("MongoDB connection failed:", err);
      process.exit(1);
    });

  // 3) Passport init
  initPassport(cfg.GOOGLE_CLIENT_ID, cfg.GOOGLE_CLIENT_SECRET, cfg.GOOGLE_CALLBACK_URL);

  // 4) CORS
  app.use(
    cors({
      origin: cfg.CORS_OPTIONS.origin,
      methods: cfg.CORS_OPTIONS.methods,
      allowedHeaders: cfg.CORS_OPTIONS.allowedHeaders,
      credentials: cfg.CORS_OPTIONS.credentials,
    })
  );

  // 5) Sessions
  app.use(
    session({
      secret: cfg.SESSION_SECRET,
      resave: false,
      saveUninitialized: true,
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  // 6) Routes
  app.use("/auth", createAuthRoutes(cfg.JWT_SECRET));

  // 7) Root test
  app.get("/", (req, res) => res.send("Google Auth Package Running with CORS Support"));

  // 8) Start server
  app.listen(cfg.PORT, () => console.log(`Auth server running at http://localhost:${cfg.PORT}`));
};

module.exports = { startAuthServer };

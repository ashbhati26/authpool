const express = require("express");
const session = require("express-session");
const passport = require("passport");
const mongoose = require("mongoose");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const initPassport = require("./src/config/passport");
const createAuthRoutes = require("./src/routes/auth");
const { resolveConfig } = require("./src/config/env");
const { createRateLimiters } = require("./src/security/rateLimit");
const { createCsrf } = require("./src/security/csrf");

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
  rateLimit = {},
  csrf = {},

  transformUser,
} = {}) => {
  app = express();
  app.use(express.json());
  app.use(cookieParser());

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

  // Rate limit + CSRF setup
  cfg.RATE_LIMIT = {
    global:  { ...cfg.RATE_LIMIT.global,  ...(rateLimit.global  || {}) },
    auth:    { ...cfg.RATE_LIMIT.auth,    ...(rateLimit.auth    || {}) },
    slowdown:{ ...cfg.RATE_LIMIT.slowdown, ...(rateLimit.slowdown || {}) },
  };
  const limiters = createRateLimiters(cfg.RATE_LIMIT);

  cfg.CSRF = { ...cfg.CSRF, ...(csrf || {}) };
  const csrfKit = createCsrf(cfg.CSRF);

  await mongoose
    .connect(cfg.MONGO_URI)
    .then(() => console.log("MongoDB connected"))
    .catch((err) => { console.error("MongoDB connection failed:", err); process.exit(1); });

  // Initialize Passport with providers + transformUser hook
  initPassport({
    google: {
      clientID: cfg.GOOGLE_CLIENT_ID,
      clientSecret: cfg.GOOGLE_CLIENT_SECRET,
      callbackURL: cfg.GOOGLE_CALLBACK_URL,
    },

    transformUser,
  });

  // CORS (allow CSRF header)
  const extraHeaders = cfg.CORS_OPTIONS.allowedHeaders.includes(cfg.CSRF.headerName)
    ? cfg.CORS_OPTIONS.allowedHeaders
    : [...cfg.CORS_OPTIONS.allowedHeaders, cfg.CSRF.headerName];

  app.use(cors({
    origin: cfg.CORS_OPTIONS.origin,
    methods: cfg.CORS_OPTIONS.methods,
    allowedHeaders: extraHeaders,
    credentials: cfg.CORS_OPTIONS.credentials,
  }));

  app.use(limiters.globalLimiter);

  app.use(session({
    secret: cfg.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
  }));

  app.use(passport.initialize());
  app.use(passport.session());

  if (csrfKit.enabled) {
    app.use("/auth", csrfKit.csrfProtection, csrfKit.sendTokenHeader,
      createAuthRoutes(cfg.JWT_SECRET, { limiters, csrfHeader: cfg.CSRF.headerName }));
  } else {
    app.use("/auth",
      createAuthRoutes(cfg.JWT_SECRET, { limiters, csrfHeader: cfg.CSRF.headerName }));
  }

  app.get("/", (_req, res) => res.send("Google Auth Package Running with CORS Support"));

  app.use((err, _req, res, next) => {
    if (err && err.code === "EBADCSRFTOKEN") return res.status(403).json({ error: "Invalid CSRF token" });
    return next(err);
  });

  app.listen(cfg.PORT, () => console.log(`Auth server running at http://localhost:${cfg.PORT}`));
};

module.exports = { startAuthServer };

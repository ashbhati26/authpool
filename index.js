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
} = {}) => {
  app = express();

  // Body & cookie parsing
  app.use(express.json());
  app.use(cookieParser());

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

  // Merge user overrides for rateLimit
  cfg.RATE_LIMIT = {
    global: { ...cfg.RATE_LIMIT.global, ...(rateLimit.global || {}) },
    auth: { ...cfg.RATE_LIMIT.auth, ...(rateLimit.auth || {}) },
    slowdown: { ...cfg.RATE_LIMIT.slowdown, ...(rateLimit.slowdown || {}) },
  };
  const limiters = createRateLimiters(cfg.RATE_LIMIT);

  // Merge user overrides for CSRF
  cfg.CSRF = { ...cfg.CSRF, ...(csrf || {}) };
  const csrfKit = createCsrf(cfg.CSRF);

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

  // 4) CORS (allow CSRF header from client)
  const extraHeaders = cfg.CORS_OPTIONS.allowedHeaders.includes(cfg.CSRF.headerName)
    ? cfg.CORS_OPTIONS.allowedHeaders
    : [...cfg.CORS_OPTIONS.allowedHeaders, cfg.CSRF.headerName];

  app.use(
    cors({
      origin: cfg.CORS_OPTIONS.origin,
      methods: cfg.CORS_OPTIONS.methods,
      allowedHeaders: extraHeaders,
      credentials: cfg.CORS_OPTIONS.credentials,
    })
  );

  // 5) Global rate limiter
  app.use(limiters.globalLimiter);

  // 6) Sessions
  app.use(
    session({
      secret: cfg.SESSION_SECRET,
      resave: false,
      saveUninitialized: true,
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  // 7) CSRF (session mode) for /auth routes
  if (csrfKit.enabled) {
    app.use(
      "/auth",
      csrfKit.csrfProtection,
      csrfKit.sendTokenHeader,
      createAuthRoutes(cfg.JWT_SECRET, { limiters, csrfHeader: cfg.CSRF.headerName })
    );
  } else {
    app.use("/auth", createAuthRoutes(cfg.JWT_SECRET, { limiters, csrfHeader: cfg.CSRF.headerName }));
  }

  // 8) Root test
  app.get("/", (req, res) => res.send("Google Auth Package Running with CORS Support"));

  // 9) CSRF error handler → 403
  app.use((err, req, res, next) => {
    if (err && err.code === "EBADCSRFTOKEN") {
      return res.status(403).json({ error: "Invalid CSRF token" });
    }
    return next(err);
  });

  // 10) Start server
  app.listen(cfg.PORT, () => console.log(`Auth server running at http://localhost:${cfg.PORT}`));
};

module.exports = { startAuthServer };

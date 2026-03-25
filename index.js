const express = require("express");
const session = require("express-session");
const passport = require("passport");
const mongoose = require("mongoose");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const MongoStore = require("connect-mongo");

const initPassport = require("./src/config/passport");
const createAuthRoutes = require("./src/routes/auth");
const { resolveConfig } = require("./src/config/env");
const { createRateLimiters } = require("./src/security/rateLimit");
const { createCsrf } = require("./src/security/csrf");
const { createRedisClient } = require("./src/config/redis");

/**
 * Start the AuthPool authentication server.
 *
 * @param {import('./types').AuthPoolOptions} options
 * @returns {Promise<{ app: import('express').Application, server: import('http').Server }>}
 */
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
  redis = {},
  transformUser,
  onReady,
} = {}) => {
  const app = express();

  // ── Security headers (helmet) ──────────────────────────────────────────────
  app.use(helmet());

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // ── Config resolution ─────────────────────────────────────────────────────
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

  // Merge caller overrides for rate-limit + csrf
  cfg.RATE_LIMIT = {
    global:   { ...cfg.RATE_LIMIT.global,   ...(rateLimit.global   || {}) },
    auth:     { ...cfg.RATE_LIMIT.auth,     ...(rateLimit.auth     || {}) },
    slowdown: { ...cfg.RATE_LIMIT.slowdown, ...(rateLimit.slowdown || {}) },
  };
  cfg.CSRF = { ...cfg.CSRF, ...(csrf || {}) };

  // ── Redis (optional) ──────────────────────────────────────────────────────
  const redisClient = await createRedisClient(redis);

  // ── MongoDB ───────────────────────────────────────────────────────────────
  await mongoose
    .connect(cfg.MONGO_URI)
    .then(() => console.log("✅ MongoDB connected"))
    .catch((err) => {
      console.error("❌ MongoDB connection failed:", err);
      process.exit(1);
    });

  // ── Rate limiting + CSRF ──────────────────────────────────────────────────
  const limiters = createRateLimiters(cfg.RATE_LIMIT, redisClient);
  const csrfKit  = createCsrf(cfg.CSRF);

  // ── Passport ──────────────────────────────────────────────────────────────
  initPassport({ google: { clientID: cfg.GOOGLE_CLIENT_ID, clientSecret: cfg.GOOGLE_CLIENT_SECRET, callbackURL: cfg.GOOGLE_CALLBACK_URL }, transformUser });

  // ── CORS ──────────────────────────────────────────────────────────────────
  const extraHeaders = cfg.CORS_OPTIONS.allowedHeaders.includes(cfg.CSRF.headerName)
    ? cfg.CORS_OPTIONS.allowedHeaders
    : [...cfg.CORS_OPTIONS.allowedHeaders, cfg.CSRF.headerName];

  app.use(cors({
    origin: cfg.CORS_OPTIONS.origin,
    methods: cfg.CORS_OPTIONS.methods,
    allowedHeaders: extraHeaders,
    credentials: cfg.CORS_OPTIONS.credentials,
  }));

  // ── Global rate limiter ───────────────────────────────────────────────────
  app.use(limiters.globalLimiter);

  // ── Session (backed by MongoDB, not MemoryStore) ──────────────────────────
  app.use(session({
    secret: cfg.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: cfg.MONGO_URI, ttl: 14 * 24 * 60 * 60 }),
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 14 * 24 * 60 * 60 * 1000,
    },
  }));

  app.use(passport.initialize());
  app.use(passport.session());

  // ── Auth routes (with or without CSRF) ───────────────────────────────────
  const authRouter = createAuthRoutes(cfg.JWT_SECRET, {
    limiters,
    csrfKit,
    csrfHeader: cfg.CSRF.headerName,
    redisClient,
  });

  if (csrfKit.enabled) {
    app.use("/auth", csrfKit.middleware, authRouter);
  } else {
    app.use("/auth", authRouter);
  }

  // ── Health check ──────────────────────────────────────────────────────────
  app.get("/", (_req, res) => res.json({ status: "ok", package: "authpool", version: "2.0.0" }));

  // ── Global error handler ──────────────────────────────────────────────────
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err?.code === "EBADCSRFTOKEN" || err?.message?.includes("csrf")) {
      return res.status(403).json({ error: "Invalid CSRF token" });
    }
    console.error("[AuthPool Error]", err);
    return res.status(err.status || 500).json({ error: err.message || "Internal server error" });
  });

  // ── Start listening ───────────────────────────────────────────────────────
  const server = await new Promise((resolve) => {
    const s = app.listen(cfg.PORT, () => {
      console.log(`🚀 AuthPool running at http://localhost:${cfg.PORT}`);
      resolve(s);
    });
  });

  // ── onReady hook: let callers add custom routes / middleware ──────────────
  if (typeof onReady === "function") {
    onReady(app, server);
  }

  return { app, server };
};

module.exports = { startAuthServer };
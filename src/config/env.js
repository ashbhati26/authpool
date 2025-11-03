require("dotenv").config();

function resolveConfig(opts = {}) {
  const env = process.env;

  const cfg = {
    // required
    MONGO_URI: coalesce(opts.mongoURI, env.MONGO_URI),
    GOOGLE_CLIENT_ID: coalesce(opts.googleClientID, env.GOOGLE_CLIENT_ID),
    GOOGLE_CLIENT_SECRET: coalesce(opts.googleClientSecret, env.GOOGLE_CLIENT_SECRET),
    GOOGLE_CALLBACK_URL: coalesce(opts.googleCallbackURL, env.GOOGLE_CALLBACK_URL),
    JWT_SECRET: coalesce(opts.jwtSecret, env.JWT_SECRET),
    SESSION_SECRET: coalesce(opts.sessionSecret, env.SESSION_SECRET),

    // optional
    PORT: numberish(coalesce(opts.port, env.PORT, 5000)),
    CORS_OPTIONS: normalizeCorsOptions(coalesce(opts.corsOptions, {})),
  };

  const requiredKeys = [
    ["MONGO_URI", cfg.MONGO_URI],
    ["GOOGLE_CLIENT_ID", cfg.GOOGLE_CLIENT_ID],
    ["GOOGLE_CLIENT_SECRET", cfg.GOOGLE_CLIENT_SECRET],
    ["GOOGLE_CALLBACK_URL", cfg.GOOGLE_CALLBACK_URL],
    ["JWT_SECRET", cfg.JWT_SECRET],
    ["SESSION_SECRET", cfg.SESSION_SECRET],
  ];

  const missing = requiredKeys
    .filter(([_, v]) => !isNonEmptyString(v))
    .map(([k]) => k);

  if (missing.length) {
    console.error("❌ Missing required config:");
    for (const key of missing) console.error(`  - ${key}`);
    console.error("\nTip: create a .env from .env.example and fill the values.");
    process.exit(1);
  }

  // Default rate-limit thresholds (overridable via startAuthServer({ rateLimit }))
  cfg.RATE_LIMIT = {
    global:   { windowMs: 15 * 60 * 1000, max: 300 },
    auth:     { windowMs: 60 * 1000, max: 5 },
    slowdown: { windowMs: 60 * 1000, delayAfter: 3, delayMs: 250 },
  };

  // CSRF defaults (session mode). Overridable via startAuthServer({ csrf })
  cfg.CSRF = {
    enabled: true,
    headerName: "x-csrf-token",
  };

  return cfg;
}

function coalesce(...vals) {
  for (const v of vals) {
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return undefined;
}

function numberish(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeCorsOptions(opts) {
  const o = opts || {};
  return {
    origin: o.origin ?? "*",
    methods: o.methods ?? ["GET", "POST"],
    allowedHeaders: Array.isArray(o.allowedHeaders)
      ? o.allowedHeaders
      : (o.allowedHeaders ? [o.allowedHeaders] : ["Content-Type", "Authorization"]),
    credentials: o.credentials ?? true,
  };
}

function envChecklist() {
  return [
    "MONGO_URI",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_CALLBACK_URL",
    "JWT_SECRET",
    "SESSION_SECRET",
    "(optional) PORT",
    "(optional) CORS options",
  ];
}

function printChecklist() {
  console.log("AuthPool env checklist:");
  for (const line of envChecklist()) console.log(`  - ${line}`);
}

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim() !== "";
}

module.exports = { resolveConfig, printChecklist };

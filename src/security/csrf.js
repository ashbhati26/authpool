const { doubleCsrf } = require("csrf-csrf");

/**
 * Build CSRF protection using the modern "double submit cookie" pattern (csrf-csrf).
 * Does NOT require sessions. Works with httpOnly cookies.
 *
 * @param {{ enabled?: boolean, headerName?: string, cookieName?: string, secret?: string }} opts
 * @returns {{ enabled: boolean, middleware: import('express').RequestHandler, headerName: string }}
 */
function createCsrf(opts = {}) {
  const enabled    = opts.enabled !== false;
  const headerName = (opts.headerName || "x-csrf-token").toLowerCase();
  const cookieName = opts.cookieName || "authpool.csrf";

  if (!enabled) {
    return {
      enabled: false,
      middleware: (_req, _res, next) => next(),
      headerName,
    };
  }

  const secret = opts.secret || process.env.CSRF_SECRET || process.env.SESSION_SECRET || "authpool-csrf-secret";
  const isProd = process.env.NODE_ENV === "production";

  const { doubleCsrfProtection, generateToken } = doubleCsrf({
    getSecret: () => secret,
    cookieName,
    cookieOptions: {
      httpOnly: false,   // must be readable by the double-submit check
      sameSite: "strict",
      secure: isProd,    // false in dev so HTTP works
      path: "/",
    },
    getTokenFromRequest: (req) =>
      req.headers[headerName] || req.body?._csrf || req.query?._csrf,
    ignoredMethods: ["GET", "HEAD", "OPTIONS"],
  });

  // Middleware that protects state-changing methods AND injects token on GET
  const middleware = (req, res, next) => {
    // Expose a fresh token on every GET so the frontend can grab it
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      try {
        const token = generateToken(req, res, true /* reuse if already set */);
        res.set(headerName, token);
      } catch (_) { /* ignore */ }
      return next();
    }
    return doubleCsrfProtection(req, res, next);
  };

  return { enabled, middleware, headerName, generateToken };
}

module.exports = { createCsrf };
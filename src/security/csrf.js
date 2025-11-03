// src/security/csrf.js
const csurf = require("csurf");

/**
 * Build CSRF protection for session-based mode with "double submit" header.
 * - Safe methods (GET/HEAD/OPTIONS) pass and we expose a token in a response header.
 * - State-changing methods must include that token back (header/body/query).
 *
 * @param {{ enabled?: boolean, headerName?: string }} opts
 * @returns {{ enabled: boolean, csrfProtection: import('express').RequestHandler, sendTokenHeader: import('express').RequestHandler, headerName: string }}
 */
function createCsrf(opts = {}) {
  const enabled = opts.enabled !== false;
  const headerName = (opts.headerName || "x-csrf-token").toLowerCase();

  const csrfProtection = csurf({
    ignoreMethods: ["GET", "HEAD", "OPTIONS"],
  });

  // Attach a fresh token in the response header on safe requests
  const sendTokenHeader = (req, res, next) => {
    if (typeof req.csrfToken === "function" && ["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      try {
        const token = req.csrfToken();
        res.set(headerName, token);
      } catch (_) {
        // ignore if no session yet
      }
    }
    next();
  };

  return { enabled, csrfProtection, sendTokenHeader, headerName };
}

module.exports = { createCsrf };

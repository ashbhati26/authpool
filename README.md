# AuthPool

A plug-and-play Node.js authentication server. One function call gives you Google OAuth, email/password login, JWT access tokens, rotating refresh tokens, CSRF protection, rate limiting, brute-force lockout, and role-based access control — all production-ready.

---

## Install

```bash
npm install authpool
```

---

## Quickstart

```js
const { startAuthServer } = require("authpool");

startAuthServer({
  mongoURI:      process.env.MONGO_URI,
  jwtSecret:     process.env.JWT_SECRET,
  sessionSecret: process.env.SESSION_SECRET,
});
```

The server starts at `http://localhost:5000`. All auth routes are live immediately.

---

## Environment Variables

Create a `.env` file in your project root. AuthPool loads it automatically — you don't need to call `require('dotenv')` yourself.

| Variable               | Required | Description                                      |
|------------------------|----------|--------------------------------------------------|
| `MONGO_URI`            | ✅       | MongoDB connection string                        |
| `JWT_SECRET`           | ✅       | JWT signing secret (32+ random characters)       |
| `SESSION_SECRET`       | ✅       | Session cookie secret (different from JWT)       |
| `GOOGLE_CLIENT_ID`     | OAuth    | Google OAuth client ID                           |
| `GOOGLE_CLIENT_SECRET` | OAuth    | Google OAuth client secret                       |
| `GOOGLE_CALLBACK_URL`  | OAuth    | e.g. `http://localhost:5000/auth/google/callback`|
| `PORT`                 | —        | Listening port (default: `5000`)                 |
| `CSRF_SECRET`          | —        | Separate CSRF secret (defaults to SESSION_SECRET)|
| `REDIS_URL`            | —        | Redis connection URL                             |

Missing required variables cause a clean startup error that lists exactly what's missing.

---

## API Routes

### Health

| Method | Path  | Description             |
|--------|-------|-------------------------|
| GET    | `/`   | Returns `{ status: "ok" }` |

### Auth

| Method | Path                    | Auth required | Description                                      |
|--------|-------------------------|---------------|--------------------------------------------------|
| GET    | `/auth/csrf`            | —             | Returns a CSRF token (also sent in response header) |
| POST   | `/auth/register`        | —             | Create account with `{ email, password, name }`  |
| POST   | `/auth/login`           | —             | Login with `{ email, password }`                 |
| GET    | `/auth/google`          | —             | Redirect to Google OAuth consent screen          |
| GET    | `/auth/google/callback` | —             | OAuth callback — handled automatically           |
| GET    | `/auth/protected`       | Bearer JWT    | Test route — returns decoded token payload       |
| GET    | `/auth/me`              | Bearer JWT    | Returns full user record from MongoDB            |
| GET    | `/auth/admin`           | Bearer JWT + `admin` role | Admin-only test route             |
| POST   | `/auth/refresh`         | Cookie        | Rotate refresh token, get new access token       |
| GET    | `/auth/logout`          | —             | Revoke refresh token and clear cookie            |
| POST   | `/auth/logout-all`      | Bearer JWT    | Invalidate all tokens across all devices         |

### Register & Login responses

```json
{ "accessToken": "<jwt>", "roles": ["user"] }
```

A `refreshToken` httpOnly cookie is also set automatically.

---

## Full Configuration

```js
const { startAuthServer } = require("authpool");

const { app, server } = await startAuthServer({
  // Required (or set via .env)
  mongoURI:      "mongodb://localhost:27017/myapp",
  jwtSecret:     "super-secret-32-char-minimum",
  sessionSecret: "another-secret-32-char-minimum",

  // Google OAuth (optional)
  googleClientID:     "...",
  googleClientSecret: "...",
  googleCallbackURL:  "http://localhost:5000/auth/google/callback",

  // Server
  port: 5000,

  // CORS
  corsOptions: {
    origin:      "http://localhost:3000",
    methods:     ["GET", "POST"],
    credentials: true,
  },

  // Rate limiting (these are the defaults — only override what you need)
  rateLimit: {
    global:   { windowMs: 15 * 60 * 1000, max: 300 },
    auth:     { windowMs: 60 * 1000,       max: 30  },
    slowdown: { windowMs: 60 * 1000, delayAfter: 3, delayMs: 300 },
  },

  // CSRF (enabled by default)
  csrf: {
    enabled:    true,
    headerName: "x-csrf-token",  // send this header on every mutating request
    cookieName: "authpool.csrf",
    secret:     "optional-separate-csrf-secret",
  },

  // Redis (optional but recommended for production)
  redis: {
    url: "redis://localhost:6379",
    // host: "localhost", port: 6379   ← alternative
    // enabled: false                  ← force in-memory
  },

  // Transform an OAuth profile before the DB upsert (optional)
  transformUser: (profile, provider) => ({
    googleId:   profile.id,
    email:      profile.emails?.[0]?.value,
    name:       profile.displayName,
    profilePic: profile.photos?.[0]?.value,
    roles:      ["user"],
    // add any custom fields here
  }),

  // Add your own routes after AuthPool finishes startup
  onReady: (app, server) => {
    app.get("/api/hello", (req, res) => res.json({ message: "custom route" }));
  },
});
```

---

## Frontend Usage

### 1 — Register

```js
const res = await fetch("http://localhost:5000/auth/register", {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
  credentials: "include",   // sends the cookie
  body: JSON.stringify({ email, password, name }),
});
const { accessToken } = await res.json();
```

### 2 — Attach the token to requests

```js
fetch("/api/protected-resource", {
  headers: { Authorization: `Bearer ${accessToken}` },
  credentials: "include",
});
```

### 3 — Refresh silently when the token expires

```js
async function refresh() {
  const res = await fetch("http://localhost:5000/auth/refresh", {
    method: "POST",
    credentials: "include",   // the cookie is sent automatically
  });
  const { accessToken } = await res.json();
  return accessToken;
}
```

### 4 — CSRF token

Fetch once and reuse. A fresh token is also returned in the `x-csrf-token` header of every GET response.

```js
const res = await fetch("http://localhost:5000/auth/csrf", { credentials: "include" });
const { csrfToken } = await res.json();
// Include as x-csrf-token header on every POST / PATCH / DELETE
```

---

## Adding Protected Routes

Use the `onReady` hook to access the Express app and add routes after startup:

```js
const verifyJWT       = require("authpool/src/middleware/verifyJWT");
const { authorizeRoles } = require("authpool/src/middleware/authorizeRoles");

startAuthServer({
  // ...config...
  onReady: (app) => {
    const JWT_SECRET = process.env.JWT_SECRET;

    // Any authenticated user
    app.get("/api/profile", verifyJWT(JWT_SECRET), (req, res) => {
      res.json({ user: req.user });
    });

    // Admin only
    app.get("/api/admin", verifyJWT(JWT_SECRET), authorizeRoles(["admin"]), (req, res) => {
      res.json({ message: "admin area" });
    });
  },
});
```

---

## Security Summary

| Feature               | Default                                      |
|-----------------------|----------------------------------------------|
| Password hashing      | bcrypt, 12 salt rounds                       |
| Access token expiry   | 15 minutes                                   |
| Refresh token expiry  | 30 days, rotated on every use                |
| Refresh token storage | SHA-256 hashed in MongoDB, httpOnly cookie   |
| CSRF protection       | Double-submit cookie (csrf-csrf)             |
| Brute-force lockout   | 5 failures → 15-minute IP lockout            |
| Rate limiting         | Global 300/15 min, credential 30/min         |
| HTTP headers          | helmet defaults                              |
| Session storage       | MongoDB (connect-mongo), not MemoryStore     |

---

## Redis

Redis is optional. Without it everything works using in-process memory (single server only). With it, rate limiters, brute-force counters, and the JWT user cache scale across multiple instances and survive restarts.

```bash
# Local Redis via Docker
docker run -d -p 6379:6379 redis:7
```

```
REDIS_URL=redis://localhost:6379
```

Pass `redis: { enabled: false }` to force in-memory mode even when `REDIS_URL` is set (useful in tests).

---

## TypeScript

Types are included at `authpool/types/index.d.ts`. Import `AuthPoolOptions` for full autocomplete:

```ts
import { startAuthServer, AuthPoolOptions } from "authpool";

const options: AuthPoolOptions = { /* ... */ };
await startAuthServer(options);
```

---

## Requirements

- Node.js 18+
- MongoDB 5+ (local or Atlas)
- Redis (optional, recommended for production)

---

## License

MIT
# AuthPool — Plug-and-Play Authentication Server

> **AuthPool** is a plug-and-play Node.js authentication package that provides a complete, secure, and configurable authentication system with OAuth, JWT tokens, role-based access, CSRF protection, rate limiting, and more — all out of the box.

---

## Features

* **Plug & Play Auth Server** — Start a full authentication backend in one line of code.
* **Google OAuth Integration** — Pre-configured with Google strategy (others coming soon).
* **JWT-based Authentication** — Secure access and refresh token management.
* **Session Support** — Express session management for OAuth providers.
* **Role-Based Access Control (RBAC)** — Secure routes with admin/user roles.
* **CSRF Protection** — Built-in CSRF tokens for safe cross-origin operations.
* **Rate Limiting & Slowdown** — Prevent brute-force and DDoS attacks.
* **MongoDB Integration** — Built-in schema for users and refresh tokens.
* **Custom User Transformation** — Modify or enrich OAuth user data before saving.
* **CORS Support** — Easily integrate with any frontend.
* **Secure Logout & Logout-All Sessions** — For full session lifecycle management.

---

## Installation

```bash
npm install authpool
```

or

```bash
yarn add authpool
```

---

## Basic Setup Example

Create a new file, for example `server.js`:

```js
const { startAuthServer } = require("authpool");

startAuthServer({
  mongoURI: "mongodb://localhost:27017/authpool",
  googleClientID: "YOUR_GOOGLE_CLIENT_ID",
  googleClientSecret: "YOUR_GOOGLE_CLIENT_SECRET",
  googleCallbackURL: "http://localhost:5000/auth/google/callback",
  jwtSecret: "YOUR_JWT_SECRET",
  sessionSecret: "YOUR_SESSION_SECRET",
  port: 5000,
  corsOptions: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true,
  },
});
```

Then run:

```bash
node server.js
```

Output:

```
MongoDB connected
Auth server running at http://localhost:5000
```

---

## Available Routes

| Method | Route                   | Description                     |
| ------ | ----------------------- | ------------------------------- |
| `GET`  | `/auth/google`          | Start Google OAuth login        |
| `GET`  | `/auth/google/callback` | OAuth callback handler          |
| `GET`  | `/auth/protected`       | Protected route (JWT required)  |
| `GET`  | `/auth/admin`           | Admin-only route (RBAC example) |
| `POST` | `/auth/refresh`         | Refresh access token            |
| `GET`  | `/auth/logout`          | Logout current session          |
| `POST` | `/auth/logout-all`      | Logout from all sessions        |
| `GET`  | `/auth/csrf`            | Get CSRF token for frontend     |

---

## Example: Custom User Transformation

You can customize user data before it’s stored in MongoDB:

```js
startAuthServer({
  // ... other configs
  transformUser: (profile, provider) => {
    if (provider === "google") {
      return {
        googleId: profile.id,
        email: profile.emails[0].value,
        name: profile.displayName,
        profilePic: profile.photos[0].value,
        roles: ["user"],
      };
    }
  },
});
```

---

## Token Management

AuthPool issues two types of tokens after successful login:

| Token             | Description                                                       | Expiry     |
| ----------------- | ----------------------------------------------------------------- | ---------- |
| **Access Token**  | Short-lived (used for API requests)                               | 15 minutes |
| **Refresh Token** | Stored as an HTTP-only cookie, used to generate new access tokens | 30 days    |

To refresh a token:

```bash
POST /auth/refresh
Body: { "refreshToken": "..." }
```

To logout all devices (invalidate all tokens):

```bash
POST /auth/logout-all
Authorization: Bearer <access_token>
```

---

## Role-Based Access Control (RBAC)

You can restrict routes to specific roles (like `admin`, `user`, etc.):

```js
router.get("/admin", verifyJWT(JWT_SECRET), authorizeRoles(["admin"]), (req, res) => {
  res.json({ message: "Welcome, admin!" });
});
```

* Each user has a `roles` array stored in the database.
* The middleware checks if the logged-in user has the required role.

---

## Security Layers

| Feature                    | Purpose                                               |
| -------------------------- | ----------------------------------------------------- |
| **CSRF Protection**        | Prevents cross-site request forgery attacks           |
| **Rate Limiting**          | Blocks repeated failed attempts                       |
| **Slowdown Middleware**    | Adds artificial delay after multiple failed requests  |
| **Brute-Force Lockout**    | Temporarily locks users after repeated login failures |
| **JWT Verification**       | Ensures tokens are valid and untampered               |
| **Role Authorization**     | Restricts sensitive routes                            |
| **Refresh Token Rotation** | Prevents token replay attacks                         |

---

## Environment Variables (.env)

You can use a `.env` file or pass variables directly in code.

```
MONGO_URI=mongodb://localhost:27017/authpool
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:5000/auth/google/callback
JWT_SECRET=your_jwt_secret
SESSION_SECRET=your_session_secret
PORT=5000
```

---

## Advanced Configuration

### CORS Options

```js
corsOptions: {
  origin: "http://localhost:3000",
  methods: ["GET", "POST"],
  credentials: true,
}
```

### Rate Limiting

```js
rateLimit: {
  global: { windowMs: 15 * 60 * 1000, max: 300 },
  auth: { windowMs: 60 * 1000, max: 5 },
  slowdown: { windowMs: 60 * 1000, delayAfter: 3, delayMs: 250 },
}
```

### CSRF Protection

```js
csrf: {
  enabled: true,
  headerName: "x-csrf-token"
}
```

---

## MongoDB Models

### User Model

```js
{
  googleId: String,
  name: String,
  email: String,
  profilePic: String,
  roles: ["user"],
  tokenVersion: Number,
}
```

### Refresh Token Model

```js
{
  jti: String,
  userId: ObjectId,
  hashedToken: String,
  expiresAt: Date,
  revokedAt: Date,
}
```

---

## Example Integration (Frontend)

You can easily use AuthPool with React, Next.js, or any frontend.

Example with **Next.js**:

```js
fetch("http://localhost:5000/auth/google", {
  credentials: "include"
});
```

Then, after login:

* The backend sends access and refresh tokens.
* The access token is stored in memory or secure storage.
* Use `/auth/refresh` for silent renewal.

---

## Example Protected API Usage

```js
fetch("http://localhost:5000/auth/protected", {
  headers: {
    Authorization: `Bearer ${accessToken}`,
  },
});
```

Response:

```json
{
  "message": "Token is valid",
  "user": {
    "id": "66c7f3d...",
    "name": "John Doe",
    "roles": ["user"]
  }
}
```

---

## Architecture Overview

```
                ┌──────────────────────┐
                │    Frontend App      │
                │ (React / Next.js)    │
                └─────────┬────────────┘
                          │
             OAuth        │
         (Google, GitHub) │
                          ▼
                ┌──────────────────────┐
                │     AuthPool Server  │
                │  Express + Passport  │
                ├──────────────────────┤
                │  Rate Limiting       │
                │  CSRF Protection     │
                │  JWT / Refresh Flow  │
                │  MongoDB (User + RT) │
                └──────────────────────┘
                          │
                    Secure API Calls
                          │
                          ▼
                ┌──────────────────────┐
                │   Your Application   │
                └──────────────────────┘
```

## Upcoming Features

| Feature                                 | Status  | Description                                           |
| --------------------------------------- | ------- | ----------------------------------------------------- |
| Multi-Provider OAuth (GitHub, Facebook) | 🚧 Open | Add support for more providers                        |
| TypeScript Support                      | 🚧 Open | Rewrite in TypeScript for better typings              |
| Multi-Database Support                  | 🚧 Open | Add support for different DBs (Postgres, MySQL, etc.) |

---

## Contributing

Contributions are welcome!
If you’d like to improve or add providers, open a PR or issue.

---

## License

MIT License © 2025 [Ashish Bhati](https://github.com/ashbhati26)

---

## Author

**Ashish Bhati**
* GitHub: [ashbhati26](https://github.com/ashbhati26)
* NPM: [authpool](https://www.npmjs.com/package/authpool)
* Project Type: Research & Developer Tool
* Keywords: Authentication, OAuth, Passport, JWT, Node.js, MongoDB

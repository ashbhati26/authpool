# AuthPool  – Google OAuth Simplified

AuthPool is an easy-to-use Node.js package that sets up a complete Google OAuth 2.0 server with just one function call. It handles user authentication, session management, token generation (JWT), and exposes protected routes — all ready to integrate into your app.

## Features

- Plug-and-play Google OAuth server
- Generates secure JWT tokens
- Provides a `/protected` route to test token validity
- MongoDB-based user storage
- Works great with Postman and frontend apps
- Session management with `express-session`

## Installation

```bash
npm install authpool
```

Or if you prefer yarn:

```bash
yarn add authpool
```

---

## Setup & Usage

In your server file (e.g. `auth.js`):

```js
const { startAuthServer } = require('authpool');

startAuthServer({
  mongoURI: '<your-mongo-uri>',
  googleClientID: '<your-google-client-id>',
  googleClientSecret: '<your-google-client-secret>',
  googleCallbackURL: 'http://localhost:5000/auth/google/callback',
  jwtSecret: '<your-jwt-secret>',
  sessionSecret: '<your-session-secret>',
  port: 5000, // optional (defaults to 5000)
});
```

> Replace all `<>` with your actual credentials.

---

## API Routes

### 1. Start Google Auth
```
GET /auth/google
```

Redirects the user to Google for login.

---

### 2. Callback Handler
```
GET /auth/google/callback
```

After login, returns a response like:

```json
{
  "token": "<your-jwt-token>"
}
```

---

### 3. Protected Route (JWT required)
```
GET /auth/protected
```

Use this to verify the token in Postman or frontend. Add the token in `Authorization` header:

```
Authorization: Bearer <token>
```

Returns:
```json
{
  "message": "Token is valid",
  "user": {
    "id": "...",
    "name": "...",
    "profilePic": "..."
  }
}
```

---

## How to Test in Postman

1. Open Postman.
2. Visit: `http://localhost:5000/auth/google` — login with Google.
3. Copy the returned token from `/auth/google/callback`.
4. Test `/auth/protected`:
   - Method: `GET`
   - Header: `Authorization: Bearer <token>`

---

## How to Use in Your Website

After receiving the token on frontend:
```js
fetch('http://localhost:5000/auth/protected', {
  headers: {
    Authorization: `Bearer ${token}`
  }
})
.then(res => res.json())
.then(data => console.log(data));
```

---

## Folder Structure

```
📦 authpool/
 ┣ 📂 src/
 ┃ ┣ 📂 config/
 ┃ ┃ ┗ 📜 passport.js
 ┃ ┣ 📂 models/
 ┃ ┃ ┗ 📜 User.js
 ┃ ┣ 📂 routes/
 ┃ ┃ ┗ 📜 auth.js
 ┣ 📜 index.js
```

---

## Environment Variables

Create a `.env` file in your project root:

```env
MONGO_URI=<your-mongo-uri>
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
GOOGLE_CALLBACK_URL=http://localhost:5000/auth/google/callback
JWT_SECRET=<your-jwt-secret>
SESSION_SECRET=<your-session-secret>
```

## GitHub

[https://github.com/ashbhati26/authpool](https://github.com/ashbhati26/authpool)

---

## NPM Package

[https://www.npmjs.com/package/authpool](https://www.npmjs.com/package/authpool)

---

## Author

**Ashish**  
Open-source enthusiast • Web & Mobile Developer

---

## License

MIT © 2025  
Feel free to fork, use, and contribute!

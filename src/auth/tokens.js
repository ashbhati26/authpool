const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const RefreshToken = require("../models/RefreshToken");

function signAccess(payload, secret) {
  return jwt.sign(payload, secret, { expiresIn: "15m" });
}

function signRefresh(payload, secret, jti) {
  return jwt.sign(payload, secret, { expiresIn: "30d", jwtid: jti });
}

async function persistRefresh(userId, token, jti, expSeconds) {
  const hashed = hashToken(token);
  await RefreshToken.create({
    jti,
    userId,
    hashedToken: hashed,
    expiresAt: new Date(expSeconds * 1000),
  });
}

async function revokeRefresh(jti) {
  await RefreshToken.updateOne({ jti }, { $set: { revokedAt: new Date() } });
}

async function revokeAllForUser(userId) {
  await RefreshToken.updateMany(
    { userId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } }
  );
}

async function isRefreshValid(token, jti) {
  const hashed = hashToken(token);
  const rec = await RefreshToken.findOne({ jti, revokedAt: { $exists: false } });
  return !!rec && rec.hashedToken === hashed && rec.expiresAt > new Date();
}

function decodeExp(token) {
  const decoded = jwt.decode(token);
  return decoded && decoded.exp ? decoded.exp : null;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function newJti() {
  return crypto.randomUUID();
}

module.exports = {
  signAccess,
  signRefresh,
  persistRefresh,
  revokeRefresh,
  revokeAllForUser,
  isRefreshValid,
  decodeExp,
  newJti,
};

const mongoose = require("mongoose");

const refreshTokenSchema = new mongoose.Schema(
  {
    jti: { type: String, unique: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    hashedToken: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: true },
    revokedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model("RefreshToken", refreshTokenSchema);

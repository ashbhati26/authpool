const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    // OAuth provider IDs
    googleId: { type: String, index: true, sparse: true },

    // Core fields
    name:       { type: String },
    email:      { type: String, index: true, sparse: true },
    profilePic: { type: String },

    // Local auth password (hashed). select: false means it won't be returned unless explicitly requested.
    password: { type: String, select: false },

    // Token invalidation
    tokenVersion: { type: Number, default: 0 },

    // RBAC
    roles: { type: [String], default: ["user"], index: true },
  },
  {
    timestamps: true,
    strict: true, // ← fixed: no arbitrary fields can be saved
  }
);

// Auto-hash password before saving if it was modified
userSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next();
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model("User", userSchema);
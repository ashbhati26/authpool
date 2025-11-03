const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  googleId: String,

  name: String,
  email: { type: String, index: true },
  profilePic: String,

  tokenVersion: { type: Number, default: 0 },
  roles: { type: [String], default: ['user'], index: true },
}, {
  timestamps: true,
  strict: false,
});

module.exports = mongoose.model('User', userSchema);

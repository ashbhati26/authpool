const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  googleId: String,
  name: String,
  email: String,
  profilePic: String,
  tokenVersion: {
    type: Number,
    default: 0,
  }
});

module.exports = mongoose.model('User', userSchema);

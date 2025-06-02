const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: String,
  email: { type: String, unique: true },
  password: String,
  solanaWallet: String,
  balance: { type: Number, default: 0 }
});

module.exports = mongoose.model('User', userSchema);

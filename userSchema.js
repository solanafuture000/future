const mongoose = require('mongoose');

// یوزر کی سکیمہ بنائیں
const userSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  solanaWallet: { type: String, required: true },
  balance: { type: Number, default: 0 }, // بیلنس کا فیلڈ
});

const User = mongoose.model('User', userSchema);

module.exports = User;

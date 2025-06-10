const mongoose = require('mongoose');

// یوزر کی سکیمہ بنائیں
const userSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  solanaWallet: { type: String, required: true },
  balance: { type: Number, default: 0 }, // بیلنس کا فیلڈ

  // ✅ ریوارڈ ہسٹری
  rewardHistory: [
    {
      date: { type: Date, default: Date.now },
      type: String, // Mining, Referral, Deposit, Withdraw, etc.
      amount: Number
    }
  ]
});

const User = mongoose.model('User', userSchema);

module.exports = User;

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },

  // ✅ Solana wallet
  solanaWallet: {
    publicKey: { type: String, required: true },
    secretKey: { type: String, required: true }
  },

  // ✅ Main balance
  balance: { type: Number, default: 0 },

  // ✅ Referral System
  referredBy: { type: String, default: null },
  referrals: [
    {
      username: String,
      referredAt: { type: Date, default: Date.now }
    }
  ],

  // ✅ KYC Info
  kyc: {
    status: { type: String, default: 'pending' }, // pending, verified, failed
    submittedAt: Date,
    verificationStartedAt: Date,
    retryAfter: Date,
    imagePath: String
  },

  // ✅ Mining Info
  mining: {
    lastClaimed: { type: Date, default: new Date(0) }
  },

  // ✅ Reward history log
  rewardHistory: [
    {
      date: { type: Date, default: Date.now },
      type: String, // "Mining", "Referral", "Staking", "Deposit", "Withdraw"
      amount: Number
    }
  ]
});

const User = mongoose.model('User', userSchema);

module.exports = User;

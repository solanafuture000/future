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
    imagePath: String,
    status: { type: String, default: "not_started" }, // not_started, pending, verified, failed
    submittedAt: Date,
    verifiedAt: Date,
    verificationStartedAt: Date,
    retryAfter: Date
  },

  // ✅ Mining Info
  mining: {
    lastClaimed: { type: Date, default: new Date(0) }
  },

  // ✅ Reward history (for mining, staking, deposit)
  rewardHistory: [
    {
      date: { type: Date, default: Date.now },
      type: { type: String, required: true },   // e.g., 'Mining', 'Deposit'
      amount: { type: Number, required: true }
    }
  ],

  // ✅ Staking
  stakingAmount: { type: Number, default: 0 },
  stakingRewards: { type: Number, default: 0 },

  // ✅ Account creation time
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

module.exports = User;

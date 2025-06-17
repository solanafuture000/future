const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  // ✅ Basic Info
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },

  // ✅ Solana Wallet
  solanaWallet: {
    publicKey: { type: String, required: true },
    secretKey: { type: String, required: true }
  },

  // ✅ Main Balance
  balance: { type: Number, default: 0 },

  // ✅ Admin Role
  isAdmin: { type: Boolean, default: false },

  // ✅ Referral System
  referredBy: { type: String, default: null },
  referrals: [
    {
      username: String,
      referredAt: { type: Date, default: Date.now }
    }
  ],

  // ✅ KYC Information
  kyc: {
    imagePath: String,
    status: { type: String, default: "not_started" },
    submittedAt: Date,
    verifiedAt: Date,
    verificationStartedAt: Date,
    retryAfter: Date,
    approvedByAdmin: { type: Boolean, default: false },
    reviewedBy: String,
    reviewedAt: Date
  },

  // ✅ Mining Info
  mining: {
    lastClaimed: { type: Date, default: new Date(0) },
    sessionStart: { type: Date, default: null }
  },

  // ✅ Reward History
  rewardHistory: [
    {
      date: { type: Date, default: Date.now },
      type: { type: String, required: true },
      amount: { type: Number, required: true },
      status: { type: String, default: "Success" }
    }
  ],

  // ✅ Staking Entries - Multiple allowed
  stakingEntries: [
    {
      amount: { type: Number, required: true },
      startDate: { type: Date, required: true },
      lastClaimed: { type: Date, required: true },
      rewardEarned: { type: Number, default: 0 },
      isUnstaked: { type: Boolean, default: false },
      unstakedAt: Date
    }
  ],

  stakingReward: { type: Number, default: 0 },
  totalStaked: { type: Number, default: 0 },

  // ✅ Admin Logs
  adminLogs: [
    {
      action: String,
      performedBy: String,
      date: { type: Date, default: Date.now },
      reason: String
    }
  ],

  // ✅ Account Created
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
module.exports = User;

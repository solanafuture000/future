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
    status: { type: String, default: "not_started" }, // not_started, pending, verified, failed, rejected
    submittedAt: Date,
    verifiedAt: Date,
    verificationStartedAt: Date,
    retryAfter: Date,
    approvedByAdmin: { type: Boolean, default: false },
    reviewedBy: String, // Admin username or ID
    reviewedAt: Date
  },

  // ✅ Mining Info
  mining: {
    lastClaimed: { type: Date, default: new Date(0) }
  },

  // ✅ Reward & Transaction History
  rewardHistory: [
    {
      date: { type: Date, default: Date.now },
      type: { type: String, required: true },       // e.g. 'Mining', 'Deposit', 'Withdrawal', 'Staking'
      amount: { type: Number, required: true },
      status: { type: String, default: "Success" }   // Success, Pending, Rejected
    }
  ],

  // ✅ Staking Info (Improved)
  staking: {
    amount: { type: Number, default: 0 },
    startDate: Date,
    lastClaimed: Date
  },
  stakingReward: { type: Number, default: 0 },

  // ✅ Admin Logs (for actions taken on this user)
  adminLogs: [
    {
      action: String,              // e.g. 'KYC Approved', 'KYC Rejected'
      performedBy: String,         // admin ID or name
      date: { type: Date, default: Date.now },
      reason: String
    }
  ],

  // ✅ Account Creation Date
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
module.exports = User;

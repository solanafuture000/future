const mongoose = require('mongoose');
const { Schema } = mongoose;

const userSchema = new mongoose.Schema({
  // 🔰 Basic Info
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },

  // 💼 Solana Wallet
  solanaWallet: {
    publicKey: { type: String, required: true },
    secretKey: { type: String, required: true }
  },

  // 💰 Balance & Admin
  balance: { type: Number, default: 0 },
  referralReward: { type: Number, default: 0 },
  isAdmin: { type: Boolean, default: false },
  totalDeposit: { type: Number, default: 0 },
  totalWithdraw: { type: Number, default: 0 },

  // 🔗 Referrals
  referredBy: { type: String, default: null },
  referralRewardClaimed: { type: Boolean, default: false },
  referrals: [
    {
      username: String,
      referredAt: { type: Date, default: Date.now },
      rewarded: { type: Boolean, default: false }
    }
  ],

  // ✅ KYC Info
  kyc: {
    imagePath: String,
    status: {
      type: String,
      enum: ['not_submitted', 'pending', 'approved', 'rejected'],
      default: 'not_submitted'
    },
    submittedAt: Date,
    verifiedAt: Date,
    verificationStartedAt: Date,
    retryAfter: Date,
    approvedByAdmin: { type: Boolean, default: false },
    reviewedBy: String,
    reviewedAt: Date
  },

  // ⛏️ Mining Info
  mining: {
    lastClaimed: { type: Date, default: new Date(0) },
    sessionStart: { type: Date, default: null },
    isMiningActive: { type: Boolean, default: false }
  },

  // 🎁 Reward History
  rewardHistory: [
    {
      date: { type: Date, default: Date.now },
      type: { type: String, required: true },
      amount: { type: Number, required: true },
      status: {
        type: String,
        enum: ['Pending', 'Success', 'Rejected'],
        default: 'Success'
      }
    }
  ],

  // 📈 Staking System
  stakingEntries: [
    {
      amount: Number,
      startDate: Date,
      lastClaimed: Date,
      rewardEarned: { type: Number, default: 0 },
      isUnstaked: { type: Boolean, default: false },
      unstakedAt: Date
    }
  ],
  stakingReward: { type: Number, default: 0 },
  totalStaked: { type: Number, default: 0 },
  firstStakeRewarded: { type: Boolean, default: false },

  // 🛠️ Admin Logs
  adminLogs: [
    {
      action: String,
      performedBy: String,
      date: { type: Date, default: Date.now },
      reason: String
    }
  ],

  // 📧 Email Verification
  isVerified: { type: Boolean, default: false },
  emailToken: String,
  emailCode: String,

  // 💸 Deposit History
  depositHistory: [
    {
      txId: String,
      amount: Number,
      sender: String,
      receivedAt: Date
    }
  ],

  // 🔐 Forget Password Fields
  resetCode: String,
  resetCodeExpires: Date,

  // 🟢 Last Active Timestamp
  lastActiveAt: { type: Date, default: Date.now },

  // 📅 Account Created
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
module.exports = User;

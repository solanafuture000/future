const mongoose = require('mongoose');
const { Schema } = mongoose;

const userSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },

  solanaWallet: {
    publicKey: { type: String, required: true },
    secretKey: { type: String, required: true }
  },

  balance: { type: Number, default: 0 },
  referralReward: { type: Number, default: 0 }, // ✅ Added
  isAdmin: { type: Boolean, default: false },

  referredBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  referralRewardClaimed: { type: Boolean, default: false },
  referrals: [
    {
      username: String,
      referredAt: { type: Date, default: Date.now },
      rewarded: { type: Boolean, default: false }
    }
  ],

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

  mining: {
    lastClaimed: { type: Date, default: new Date(0) },
    sessionStart: { type: Date, default: null }
  },

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

  adminLogs: [
    {
      action: String,
      performedBy: String,
      date: { type: Date, default: Date.now },
      reason: String
    }
  ],

  isVerified: { type: Boolean, default: false },
  emailToken: String,
  emailCode: String,

  depositHistory: [
    {
      txId: String,
      amount: Number,
      sender: String,
      receivedAt: Date
    }
  ],

  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
module.exports = User;

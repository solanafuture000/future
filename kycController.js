const fs = require('fs');
const User = require('./User');

// ✅ KYC Submit Controller
const submitKYC = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.kyc.status === 'approved') {
      return res.status(400).json({ message: 'KYC already approved' });
    }

    if (user.balance < 0.01) {
      return res.status(400).json({ message: 'Minimum 0.01 SOL deposit required to apply for KYC' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'Selfie with CNIC is required' });
    }

    user.kyc.imagePath = req.file.path;
    user.kyc.submittedAt = new Date();
    user.kyc.status = 'pending';
    await user.save();

    res.json({ success: true, message: '✅ Selfie with CNIC submitted.  SOLANA FUTURE AI will review your KYC.' });
  } catch (error) {
    console.error('KYC Submit Error:', error);
    res.status(500).json({ message: '❌ Server error during KYC submission' });
  }
};

// ✅ KYC Approve Controller (Fixed)
const approveKYC = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.kyc.status === 'approved') {
      return res.status(400).json({ message: 'User is already approved' });
    }

    user.kyc.status = 'approved';
    user.kyc.verifiedAt = new Date();
    user.kyc.approvedByAdmin = true;

    // ✅ KYC Reward
    const rewardAmount = 0.01;
    user.balance = (user.balance || 0) + rewardAmount;

    user.rewardHistory.push({
      type: 'KYC Reward',
      amount: rewardAmount,
      date: new Date(),
      status: 'Success'
    });

    await user.save();

    // ✅ Referral reward
    if (user.referredBy) {
      const referrer =
        typeof user.referredBy === 'string'
          ? await User.findOne({ username: user.referredBy })
          : await User.findById(user.referredBy);

      if (referrer) {
        const referralEntry = referrer.referrals.find(
          r => r.username === user.username && !r.rewarded
        );

        if (referralEntry) {
          referrer.balance += 0.01;
          referrer.referralReward = (referrer.referralReward || 0) + 0.01;

          referrer.rewardHistory.push({
            type: 'Referral Reward (KYC)',
            amount: 0.01,
            date: new Date(),
            status: 'Success'
          });

          referralEntry.rewarded = true;
          await referrer.save();
        }
      }
    }

    res.json({ success: true, message: '✅ KYC approved and reward given.' });
  } catch (error) {
    console.error('KYC Approve Error:', error);
    res.status(500).json({ message: '❌ Server error during approval' });
  }
};

// ✅ KYC Status Checker
const getKYCStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const status = user.kyc?.status || 'not_submitted';
    const submittedAt = user.kyc?.submittedAt || null;
    const verifiedAt = user.kyc?.verifiedAt || null;

    res.json({
      success: true,
      kyc: {
        status,
        submittedAt,
        verifiedAt
      }
    });
  } catch (error) {
    console.error('KYC Status Error:', error);
    res.status(500).json({ message: '❌ Failed to fetch KYC status' });
  }
};

module.exports = {
  submitKYC,
  approveKYC,
  getKYCStatus
};

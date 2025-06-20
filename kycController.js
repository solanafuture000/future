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

    res.json({ success: true, message: '✅ Selfie with CNIC submitted. Admin will review your KYC.' });
  } catch (error) {
    console.error('KYC Submit Error:', error);
    res.status(500).json({ message: '❌ Server error during KYC submission' });
  }
};

// ✅ KYC Approve Controller (with Referral Reward Fix)
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
    await user.save();

    // ✅ Give referral reward only once
    if (user.referredBy) {
      const referrer = await User.findById(user.referredBy);
      if (referrer) {
        const referralEntry = referrer.referrals.find(
          r => r.username === user.username && !r.rewarded
        );

        if (referralEntry) {
          // 💰 Reward the referrer
          referrer.balance += 0.01;
          referrer.referralReward += 0.01; // ✅ Add this line!

          // 📜 Log the reward
          referrer.rewardHistory.push({
            type: 'Referral Reward (KYC)',
            amount: 0.01,
            date: new Date(),
            status: 'Success'
          });

          // ✅ Mark referral as rewarded
          referralEntry.rewarded = true;

          await referrer.save();
        }
      }
    }

    res.json({ success: true, message: '✅ KYC approved successfully' });
  } catch (error) {
    console.error('KYC Approve Error:', error);
    res.status(500).json({ message: '❌ Server error during approval' });
  }
};

module.exports = {
  submitKYC,
  approveKYC,
  getKYCStatus
};

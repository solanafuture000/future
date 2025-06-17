const fs = require('fs');
const User = require('./User');

// 🔹 Submit KYC (Selfie with CNIC in hand)
const submitKYC = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.kyc.status === 'verified') {
      return res.status(400).json({ message: 'KYC already verified' });
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

// 🔹 Admin: Manually Verify KYC
const approveKYC = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.kyc.status === 'verified') {
      return res.status(400).json({ message: 'User is already verified' });
    }

    user.kyc.status = 'verified';
    user.kyc.verifiedAt = new Date();
    await user.save();

    // ✅ Referral reward
    if (user.referrer) {
      const referrer = await User.findById(user.referrer);
      if (referrer) {
        referrer.balance += 0.01;
        referrer.boostPercent = (referrer.boostPercent || 0) + 5;
        referrer.rewardHistory.push({
          type: 'Referral Reward',
          amount: 0.01,
          date: new Date(),
          status: 'Success'
        });
        await referrer.save();
      }
    }

    res.json({ success: true, message: '✅ KYC verified successfully' });
  } catch (error) {
    console.error('KYC Approve Error:', error);
    res.status(500).json({ message: '❌ Server error during approval' });
  }
};
// KYC VERIFY ENDPOINT or logic ke andar yeh lagao:
if (user.kyc.status === 'verified' && user.referredBy) {
  const referrer = await User.findById(user.referredBy);
  if (referrer) {
    const referralEntry = referrer.referrals.find(r => r.username === user.username);

    if (referralEntry && !referralEntry.rewarded) {
      referrer.balance += 0.01;
      referralEntry.rewarded = true;
      await referrer.save();
    }
  }
}


module.exports = {
  submitKYC,
  approveKYC
};

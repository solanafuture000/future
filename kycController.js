const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const User = require('./User');

// 🔐 Face++ credentials from .env
const FACEPP_API_KEY = process.env.FACEPP_API_KEY;
const FACEPP_API_SECRET = process.env.FACEPP_API_SECRET;

// 🔹 Submit KYC
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
      return res.status(400).json({ message: 'Selfie image is required' });
    }

    user.kyc.imagePath = req.file.path;
    user.kyc.submittedAt = new Date();
    user.kyc.status = 'pending';
    await user.save();

    res.json({ success: true, message: '✅ Selfie submitted. Please verify now.' });
  } catch (error) {
    console.error('KYC Submit Error:', error);
    res.status(500).json({ message: '❌ Server error during KYC submission' });
  }
};

// 🔹 Verify KYC
const verifyKYC = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.kyc.status === 'verified') {
      return res.status(400).json({ message: 'KYC already verified' });
    }

    if (!user.kyc.imagePath || !fs.existsSync(user.kyc.imagePath)) {
      return res.status(400).json({ message: '❌ Selfie not found. Please re-submit KYC.' });
    }

    const form = new FormData();
    form.append('api_key', FACEPP_API_KEY);
    form.append('api_secret', FACEPP_API_SECRET);
    form.append('image_file', fs.createReadStream(user.kyc.imagePath));
    form.append('return_attributes', 'blur,eyestatus,headpose');

    const response = await axios.post(
      'https://api-us.faceplusplus.com/facepp/v3/detect',
      form,
      { headers: form.getHeaders() }
    );

    const faces = response.data.faces;

    // 🧹 Cleanup image
    fs.unlinkSync(user.kyc.imagePath);
    user.kyc.imagePath = undefined;

    if (faces && faces.length > 0) {
      user.kyc.status = 'verified';
      user.kyc.verifiedAt = new Date();
      await user.save();

      // 🎁 Referral reward
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

      return res.json({ success: true, message: '✅ KYC Verified Successfully' });
    } else {
      user.kyc.status = 'failed';
      await user.save();
      return res.status(400).json({ success: false, message: '❌ Face not detected. Try again.' });
    }

  } catch (error) {
    console.error('KYC Verification Error:', error);
    res.status(500).json({ success: false, message: '❌ Server error during verification' });
  }
};

module.exports = { submitKYC, verifyKYC };

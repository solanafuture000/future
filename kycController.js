const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const User = require('../models/User');

// ✅ Face++ credentials
const FACEPP_API_KEY = '20Wza9102OVnDvgl2ptAsij0UuGEAMQV';
const FACEPP_API_SECRET = 'KjTuojESnEWbYgrdLca5ahR0AKqkX1Vf';

// 🔹 KYC SUBMIT: Upload selfie, mark status = pending
const submitKYC = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.kyc.status === 'verified')
      return res.status(400).json({ message: 'KYC already verified' });

    if (user.balance < 0.01)
      return res.status(400).json({ message: 'You must deposit at least 0.01 SOL to apply for KYC' });

    if (user.kyc.retryAfter && new Date() < user.kyc.retryAfter) {
      const daysLeft = Math.ceil((user.kyc.retryAfter - new Date()) / (1000 * 60 * 60 * 24));
      return res.status(400).json({ message: `Retry KYC after ${daysLeft} day(s)` });
    }

    if (!req.file)
      return res.status(400).json({ message: 'Selfie image is required' });

    user.kyc.imagePath = req.file.path;
    user.kyc.submittedAt = new Date();
    user.kyc.status = 'pending';
    user.kyc.verificationStartedAt = new Date();
    await user.save();

    res.json({ message: 'KYC selfie submitted. Verification started. You have 5 minutes to complete.' });
  } catch (err) {
    console.error('KYC submit error:', err);
    res.status(500).json({ message: 'KYC submission error' });
  }
};

// 🔹 KYC VERIFY: Send image to Face++ for face detection
const verifyKYC = async (req, res) => {
  const userId = req.user.id;

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.kyc.status === 'verified')
      return res.status(400).json({ message: 'KYC already verified' });

    if (!user.kyc.imagePath || !fs.existsSync(user.kyc.imagePath))
      return res.status(400).json({ message: 'No selfie found. Please submit KYC first.' });

    if (!user.kyc.verificationStartedAt)
      return res.status(400).json({ message: 'Verification not started. Submit KYC first.' });

    const now = new Date();
    const timeDiff = now - new Date(user.kyc.verificationStartedAt);
    if (timeDiff > 5 * 60 * 1000) {
      user.kyc.status = 'failed';
      user.kyc.retryAfter = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      await user.save();
      return res.status(400).json({ message: '⏱️ KYC expired (5 mins). Retry after 3 days' });
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
    if (faces && faces.length > 0) {
      user.kyc.status = 'verified';
      user.kyc.verifiedAt = new Date();
      user.kyc.verificationStartedAt = null;
      await user.save();
      fs.unlinkSync(user.kyc.imagePath); // Cleanup
      user.kyc.imagePath = undefined;

      return res.json({ success: true, message: '✅ KYC verified successfully' });
    } else {
      user.kyc.status = 'failed';
      user.kyc.retryAfter = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      await user.save();
      fs.unlinkSync(user.kyc.imagePath); // Cleanup
      user.kyc.imagePath = undefined;

      return res.status(400).json({ success: false, message: '❌ No face detected. Retry after 3 days' });
    }

  } catch (error) {
    console.error('KYC Error:', error);
    res.status(500).json({ success: false, message: 'KYC verification failed. Try again later.' });
  }
};

module.exports = { submitKYC, verifyKYC };

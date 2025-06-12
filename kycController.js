const axios = require('axios');
const fs = require('fs');
const path = require('path');
const User = require('../models/User');

// ✅ Face++ credentials
const FACEPP_API_KEY = 'YOUR_FACEPP_API_KEY';
const FACEPP_API_SECRET = 'YOUR_FACEPP_API_SECRET';

const verifyKYC = async (req, res) => {
  try {
    const userId = req.user.id; // From JWT middleware
    const filePath = req.file.path;

    // Step 1: Send image to Face++ for liveliness detection
    const imageData = fs.readFileSync(filePath);

    const response = await axios({
      method: 'post',
      url: 'https://api-us.faceplusplus.com/facepp/v3/detect',
      headers: { 'Content-Type': 'multipart/form-data' },
      data: {
        api_key: FACEPP_API_KEY,
        api_secret: FACEPP_API_SECRET,
        image_file: imageData,
        return_attributes: 'blur,eyestatus,headpose'
      }
    });

    // Step 2: Handle result
    const faces = response.data.faces;
    if (faces && faces.length > 0) {
      // ✅ Face detected: mark KYC verified
      await User.findByIdAndUpdate(userId, {
        isKYCVerified: true,
        kycVerifiedAt: new Date()
      });

      res.json({ success: true, message: "KYC verified successfully ✅" });
    } else {
      res.status(400).json({ success: false, message: "No face detected. Try again." });
    }

    // Step 3: Clean up uploaded image
    fs.unlinkSync(filePath);
  } catch (error) {
    console.error('KYC Error:', error);
    res.status(500).json({ success: false, message: "KYC verification failed. Try again later." });
  }
};

module.exports = { verifyKYC };

const express = require('express');
const router = express.Router();

const { submitKYC, approveKYC } = require('./kycController');
const authenticate = require('./authenticate');
const upload = require('./upload'); // ✅ Must exist at root or correct path

// 🔹 User submits selfie with CNIC
router.post('/kyc/submit', authenticate, upload.single('selfie'), submitKYC);

// 🔹 Admin manually verifies the KYC
router.post('/kyc/approve/:userId', authenticate, approveKYC); // ✅ Changed from 'verify' to 'approve'

module.exports = router;

const express = require('express');
const router = express.Router();

const { submitKYC, approveKYC, getKYCStatus } = require('./kycController');
const authenticate = require('./authenticate');
const upload = require('./upload'); // ✅ Make sure this works (e.g., multer middleware)

// 🔹 User submits selfie with CNIC
router.post('/kyc/submit', authenticate, upload.single('selfie'), submitKYC);

// 🔹 Admin manually verifies the KYC
router.post('/kyc/approve/:userId', authenticate, approveKYC);

// 🔹 Get current user's KYC status
router.get('/kyc/status', authenticate, getKYCStatus);

module.exports = router;

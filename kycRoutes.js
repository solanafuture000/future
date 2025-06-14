const express = require('express');
const router = express.Router();

const { submitKYC, verifyKYC } = require('./kycController');
const authenticate = require('./authenticate');
const upload = require('./middleware/upload');

// 🔹 User submits selfie for KYC
router.post('/kyc/submit', authenticate, upload.single('selfie'), submitKYC);

// 🔹 Admin or backend verifies selfie
router.post('/kyc/verify', authenticate, verifyKYC);

module.exports = router;

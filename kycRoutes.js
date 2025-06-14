const express = require('express');
const router = express.Router();

const { submitKYC, verifyKYC } = require('./kycController');
const authenticate = require('./authenticate');
const upload = require('./upload'); // ✅ یہاں upload صحیح طریقے سے import ہو رہا

// 🔹 User submits selfie for KYC
router.post('/kyc/submit', authenticate, upload.single('selfie'), submitKYC);

// 🔹 Backend verifies selfie
router.post('/kyc/verify', authenticate, verifyKYC);

module.exports = router;

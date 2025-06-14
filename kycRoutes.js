const express = require('express');
const router = express.Router();
const { submitKYC, verifyKYC } = require('./kycController');
const authenticate = require('./authenticate');
const upload = require('./upload');


router.post('/kyc/submit', authenticate, upload.single('selfie'), submitKYC);
router.post('/kyc/verify', authenticate, verifyKYC);

module.exports = router;

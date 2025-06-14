const express = require('express');
const router = express.Router();
const { submitKYC, approveKYC } = require('../kycController'); // 👈 your current file path
const authenticate = require('../middleware/authenticate');
const upload = require('../middleware/upload'); // multer middleware for file upload
// const adminOnly = require('../middleware/admin'); // optional

router.post('/kyc/submit', authenticate, upload.single('selfie'), submitKYC);
router.post('/kyc/approve/:userId', /*adminOnly,*/ approveKYC); // Remove comment if using admin access

module.exports = router;

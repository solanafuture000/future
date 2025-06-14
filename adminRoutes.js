const express = require('express');
const router = express.Router();
const authenticate = require('./middleware/authenticate');
const isAdmin = require('./middleware/admin');
const User = require('./User');
const fs = require('fs');

// 🔹 Get all pending KYC requests
router.get('/kyc-requests', authenticate, isAdmin, async (req, res) => {
  try {
    const requests = await User.find({ 'kyc.status': 'pending' });
    res.json({ success: true, requests });
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching requests' });
  }
});

// 🔹 Approve KYC
router.post('/approve/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.kyc.status = 'verified';
    user.kyc.verifiedAt = new Date();
    user.kyc.approvedByAdmin = true;

    // 🧹 Cleanup image
    if (user.kyc.imagePath && fs.existsSync(user.kyc.imagePath)) {
      fs.unlinkSync(user.kyc.imagePath);
      user.kyc.imagePath = undefined;
    }

    await user.save();
    res.json({ success: true, message: '✅ KYC approved manually' });
  } catch (error) {
    res.status(500).json({ message: 'Server error during approval' });
  }
});

// 🔹 Reject KYC
router.post('/reject/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.kyc.status = 'rejected';
    user.kyc.reason = req.body.reason || 'Not specified';
    user.kyc.retryAfter = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // Retry after 3 days

    // 🧹 Cleanup image
    if (user.kyc.imagePath && fs.existsSync(user.kyc.imagePath)) {
      fs.unlinkSync(user.kyc.imagePath);
      user.kyc.imagePath = undefined;
    }

    await user.save();
    res.json({ success: true, message: '❌ KYC rejected with reason' });
  } catch (error) {
    res.status(500).json({ message: 'Server error during rejection' });
  }
});

module.exports = router;

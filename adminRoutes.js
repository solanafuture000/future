const express = require('express');
const router = express.Router();
const authenticate = require('./middleware/authenticate'); // Token verify
const isAdmin = require('./middleware/admin'); // Admin check
const User = require('./User');

// 🔹 GET: All Pending KYC Requests
router.get('/kyc-requests', authenticate, isAdmin, async (req, res) => {
  try {
    const requests = await User.find({ 'kyc.status': 'pending' });
    res.json(requests);
  } catch (err) {
    console.error('❌ Error fetching KYC requests:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// 🔹 POST: Approve KYC
router.post('/approve/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.kyc.status = 'verified';
    user.kyc.verifiedAt = new Date();
    user.kyc.approvedByAdmin = true;
    await user.save();

    res.json({ success: true, message: '✅ KYC approved successfully.' });
  } catch (err) {
    console.error('❌ Approval error:', err);
    res.status(500).json({ message: 'Server error during approval' });
  }
});

// 🔹 POST: Reject KYC
router.post('/reject/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.kyc.status = 'rejected';
    await user.save();

    res.json({ success: true, message: '❌ KYC rejected.' });
  } catch (err) {
    console.error('❌ Rejection error:', err);
    res.status(500).json({ message: 'Server error during rejection' });
  }
});

module.exports = router;

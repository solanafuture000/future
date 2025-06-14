const express = require('express');
const router = express.Router();
const authenticate = require('./middleware/authenticate');
const isAdmin = require('./middleware/admin');
const User = require('./User');

// 🔹 Get all KYC requests
router.get('/kyc-requests', authenticate, isAdmin, async (req, res) => {
  const requests = await User.find({ 'kyc.status': 'pending' });
  res.json(requests);
});

// 🔹 Approve KYC
router.post('/approve/:id', authenticate, isAdmin, async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  user.kyc.status = 'verified';
  user.kyc.verifiedAt = new Date();
  user.kyc.approvedByAdmin = true;
  await user.save();

  res.json({ success: true, message: '✅ KYC approved manually' });
});

// 🔹 Reject KYC
router.post('/reject/:id', authenticate, isAdmin, async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  user.kyc.status = 'rejected';
  await user.save();

  res.json({ success: true, message: '❌ KYC rejected' });
});

module.exports = router;

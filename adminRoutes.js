const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('./User');

// ✅ Middleware: Authenticate user from JWT
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Unauthorized" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secretKey');
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

// ✅ Middleware: Check if user is admin
const isAdmin = async (req, res, next) => {
  const user = await User.findById(req.user.id);
  if (!user || user.email !== 'admin@solana.com') {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
};

// ✅ GET all KYC requests (pending)
router.get('/kyc-requests', authenticate, isAdmin, async (req, res) => {
  try {
    const requests = await User.find({ 'kyc.status': 'pending' });
    res.json(requests);
  } catch (error) {
    console.error('Fetch KYC error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ✅ Approve KYC
router.post('/approve/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.kyc.status = 'verified';
    user.kyc.verifiedAt = new Date();
    user.kyc.approvedByAdmin = true;
    await user.save();

    res.json({ success: true, message: '✅ KYC approved manually' });
  } catch (err) {
    res.status(500).json({ message: 'Server error during approval' });
  }
});

// ✅ Reject KYC
router.post('/reject/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.kyc.status = 'rejected';
    await user.save();

    res.json({ success: true, message: '❌ KYC rejected' });
  } catch (err) {
    res.status(500).json({ message: 'Server error during rejection' });
  }
});

module.exports = router;

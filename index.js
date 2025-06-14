require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Keypair } = require('@solana/web3.js');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const kycController = require('./kycController');
const WithdrawRequest = require('./models/withdrawRequest');
const User = require('./User');
const kycRoutes = require('./kycRoutes');
const adminRoutes = require('./adminRoutes');
const authenticate = require('./authenticate');


const app = express();

// Enhanced CORS configuration
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

app.use('/api', kycRoutes); // Now all KYC endpoints work under /api
app.use(express.json());
app.use('/uploads', express.static('uploads'));
app.use('/admin', adminRoutes);
app.use(express.static(path.join(__dirname, 'public')))


const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    }
});

async function sendWelcomeEmail(toEmail, username) {
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: toEmail,
        subject: 'Welcome to Solana Mining App',
        text: `Hello ${username},\n\nThank you for registering in our Solana Mining App!`
    };
    try {
        await transporter.sendMail(mailOptions);
        console.log('✅ Email sent to:', toEmail);
    } catch (error) {
        console.error('❌ Email error:', error);
    }
}
mongoose.connect(process.env.MONGO_URI, {
    dbName: 'soldatabase',
}).then(() => {
    console.log('✅ MongoDB connected');
}).catch(err => console.error('❌ MongoDB error:', err));

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './uploads';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir);
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

async function getUplineUsers(username, levels = 10) {
    let uplines = [];
    let currentUser = await User.findOne({ username });
    for (let i = 0; i < levels; i++) {
        if (!currentUser || !currentUser.referredBy) break;
        const uplineUser = await User.findOne({ username: currentUser.referredBy });
        if (!uplineUser) break;
        uplines.push(uplineUser);
        currentUser = uplineUser;
    }
    return uplines;
}
// REGISTER
app.post('/register', async (req, res) => {
  try {
    let { username, email, password, referredBy } = req.body;

    if (!username || !email || !password)
      return res.status(400).json({ success: false, message: 'Please provide username, email and password' });

    // Trim inputs
    username = username.trim();
    email = email.trim();

    // Check existing users
    const existingEmail = await User.findOne({ email });
    if (existingEmail)
      return res.status(400).json({ success: false, message: 'Email already exists' });

    const existingUsername = await User.findOne({ username });
    if (existingUsername)
      return res.status(400).json({ success: false, message: 'Username already exists' });

    const hashed = await bcrypt.hash(password, 10);
    const wallet = Keypair.generate();

    const newUser = new User({
      username,
      email,
      password: hashed,
      solanaWallet: {
        publicKey: wallet.publicKey.toString(),
        secretKey: Buffer.from(wallet.secretKey).toString('base64'),
      },
      referredBy: null,
      balance: 0,
      mining: { lastClaimed: new Date(0) },
      kyc: { status: 'pending' },
      referrals: []
    });

    // ✅ Check for valid referrer
    if (referredBy) {
      const referrer = await User.findOne({ username: referredBy.trim() });
      if (referrer) {
        newUser.referredBy = referrer._id; // store ObjectId reference
        referrer.referrals.push({ username: newUser.username });
        await referrer.save();
      }
    }

    await newUser.save();

    // Optional: Send welcome email
    await sendWelcomeEmail(email, username);

    const token = jwt.sign(
      { id: newUser._id, username: newUser.username },
      process.env.JWT_SECRET || 'secretKey',
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      message: 'Registered successfully',
      token,
      user: {
        username: newUser.username,
        email: newUser.email
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});// ✅ Leaderboard Route (Fixed)
app.get('/leaderboard', async (req, res) => {
  try {
    const topUsers = await User.find({})
      .sort({ balance: -1 })
      .limit(100)
      .select('username balance -_id');

    // 🔁 Note: Changed `leaderboard` to `users`
    res.json({ success: true, users: topUsers });
  } catch (err) {
    console.error('Leaderboard error:', err);
    res.status(500).json({ success: false, message: 'Server error loading leaderboard' });
  }
});


app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ success: false, message: 'Email and password required' });

    const user = await User.findOne({ email });
    if (!user)
      return res.status(404).json({ success: false, message: 'User not found' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ success: false, message: 'Invalid password' });

    const token = jwt.sign(
      { id: user._id, username: user.username },
      process.env.JWT_SECRET || 'secretKey',
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        username: user.username,
        email: user.email
      }
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.get('/profile', authenticate, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ success: false, message: "User not found" });

  // ✅ Check staking status
  if (user.staking && user.staking.amount > 0 && user.staking.startDate) {
    const now = new Date();
    const lastClaimed = new Date(user.staking.lastClaimed || user.staking.startDate);
    const hoursPassed = (now - lastClaimed) / (1000 * 60 * 60);

    if (hoursPassed >= 24) {
      const daysStaked = (now - new Date(user.staking.startDate)) / (1000 * 60 * 60 * 24);

      let dailyPercent = 0;
      if (daysStaked >= 30) {
        dailyPercent = 5;
      } else if (daysStaked >= 7) {
        dailyPercent = 3;
      }

      if (dailyPercent > 0) {
        const rewardAmount = (user.staking.amount * dailyPercent) / 100;

        // Update user
        user.balance += rewardAmount;
        user.stakingReward = (user.stakingReward || 0) + rewardAmount;
        user.staking.lastClaimed = now;

        user.rewardHistory.push({
          type: 'Staking Reward',
          amount: rewardAmount,
          date: now,
          status: 'Success'
        });

        await user.save();
      }
    }
  }

  // ✅ Send profile info
  res.json({
    success: true,
    user: {
      username: user.username,
      email: user.email,
      balance: user.balance,
      referralReward: user.referralReward || 0,
      stakingReward: user.stakingReward || 0,
      solanaWallet: user.solanaWallet,
      referredBy: user.referredBy,
      kyc: {
        status: user.kyc?.status || "not_started",
        imagePath: user.kyc?.imagePath || null,
        submittedAt: user.kyc?.submittedAt || null,
        verifiedAt: user.kyc?.verifiedAt || null,
        verificationStartedAt: user.kyc?.verificationStartedAt || null,
        retryAfter: user.kyc?.retryAfter || null
      }
    }
  });
});
// WITHDRAW
app.post('/withdraw', authenticate, async (req, res) => {
  try {
    const { amount, address } = req.body;
    const user = await User.findById(req.user.id);

    if (!user || !user.solanaWallet?.publicKey)
      return res.status(400).json({ message: 'Invalid user or wallet' });

    if (user.kyc.status !== 'verified')
      return res.status(400).json({ message: 'KYC not verified' });

    const withdrawAmount = parseFloat(amount);
    if (isNaN(withdrawAmount) || withdrawAmount < 0.1)
      return res.status(400).json({ message: 'Minimum withdrawal is 0.1 SOL' });

    if (user.balance < withdrawAmount)
      return res.status(400).json({ message: 'Insufficient balance' });

    user.balance -= withdrawAmount;

    user.rewardHistory.push({
      date: new Date(),
      type: 'Withdrawal',
      amount: withdrawAmount
    });

    await user.save();

    const request = new WithdrawRequest({
      userId: user._id,
      walletAddress: address,
      amount: withdrawAmount,
      status: 'pending'
    });
    await request.save();

    res.json({ success: true, message: 'Withdrawal request submitted.' });

  } catch (err) {
    console.error('Withdraw error:', err);
    res.status(500).json({ message: 'Withdraw failed. Try again later.' });
  }
});
﻿
// ✅ Stake Route
app.post('/stake', authenticate, async (req, res) => {
  const { amount } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ success: false, message: "Invalid amount" });

  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ success: false, message: "User not found" });

  if (user.balance < amount) return res.status(400).json({ success: false, message: "Insufficient balance" });

  user.balance -= amount;
  user.staking = {
    amount: amount,
    startDate: new Date(),
    lastClaimed: new Date()
  };
  await user.save();

  res.json({ success: true, message: "Staked successfully", staking: user.staking });
});

// ✅ Unstake Route
app.post('/unstake', authenticate, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user || !user.staking?.amount) return res.status(400).json({ success: false, message: "No staking found" });

  const now = new Date();
  const startDate = new Date(user.staking.startDate);
  const daysStaked = (now - startDate) / (1000 * 60 * 60 * 24);

  let reward = 0;
  let message = 'Unstaked successfully';

  if (daysStaked >= 7) {
    if (daysStaked >= 30) {
      reward = (user.staking.amount * 5 / 100);
    } else {
      reward = (user.staking.amount * 3 / 100);
    }

    user.balance += reward;
    user.stakingReward += reward;
    user.rewardHistory.push({
      type: 'Staking Reward (Unstake)',
      amount: reward,
      date: now,
      status: 'Success'
    });
  } else {
    message = "Unstaked before 7 days — reward forfeited";
    user.rewardHistory.push({
      type: 'Unstake (Early)',
      amount: 0,
      date: now,
      status: 'Forfeited'
    });
  }

  user.balance += user.staking.amount;
  user.staking = { amount: 0, startDate: null, lastClaimed: null };
  await user.save();

  res.json({ success: true, message, rewardGiven: reward });
});

// CLAIM STAKING REWARDS
app.post('/stake/claim', authenticate, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  if (user.staking.amount === 0) return res.status(400).json({ message: 'No active staking' });

  const now = new Date();
  const daysStaked = Math.floor((now - user.staking.lastClaimed) / (1000 * 60 * 60 * 24));
  if (daysStaked < 1) return res.status(400).json({ message: 'You can claim staking rewards once per day' });

  if ((now - user.staking.startTime) < 30 * 24 * 60 * 60 * 1000)
    return res.status(400).json({ message: 'Lock period of 30 days not finished yet' });

  const reward = user.staking.amount * 0.02 * daysStaked;

  user.balance += reward;
  user.staking.lastClaimed = now;

  user.rewardHistory.push({
    date: now,
    type: 'Staking',
    amount: reward
  });

  await user.save();

  res.json({ message: `Claimed ${reward.toFixed(4)} SOL staking rewards`, newBalance: user.balance });
});
// MINING REWARD CLAIM (Updated with Boost Logic)
app.post('/mine/claim', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const now = new Date();
    const lastClaim = user.mining.lastClaimed || new Date(0);
    const maxMiningDurationMs = 3 * 60 * 60 * 1000; // 3 hours
    const diffMs = now - lastClaim;
    const eligibleMs = Math.min(diffMs, maxMiningDurationMs);

    if (eligibleMs <= 0) {
      return res.status(400).json({ message: 'No mining reward available yet.' });
    }

    // 🔹 Base reward per ms
    const rewardPerMs = 0.00025 / maxMiningDurationMs;
    let reward = rewardPerMs * eligibleMs;

    // 🔹 Boost based on verified referrals
    const verifiedReferrals = await User.find({
      username: { $in: user.referrals.map(r => r.username) },
      'kyc.status': 'verified',
      balance: { $gte: 0.01 }
    });

    const boostPercent = 0.05 * verifiedReferrals.length; // 5% per verified referral
    const boostedReward = reward * boostPercent;

    // Total reward = base + boost
    const totalReward = reward + boostedReward;

    // 🔹 Update upline bonuses (0.01 SOL only when referral KYC verified — handled elsewhere)

    // 🔹 Update user's balance and mining
    user.balance += totalReward;
    user.mining.lastClaimed = now;

    user.rewardHistory.push({
      date: now,
      type: 'Mining',
      amount: totalReward
    });

    await user.save();

    res.json({
      success: true,
      message: `You mined ${totalReward.toFixed(6)} SOL (Boost: ${boostPercent * 100}%)!`,
      earned: totalReward.toFixed(6),
      balance: user.balance
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error during claim' });
  }
});



const PORT = process.env.PORT || 3005;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});

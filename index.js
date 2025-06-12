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
const User = require('./userSchema');

const app = express();

// Enhanced CORS configuration
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

app.use(express.json());
app.use('/uploads', express.static('uploads'));

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

const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: 'Unauthorized - Token missing' });

    const token = authHeader.split(' ')[1] || authHeader;
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secretKey');
        req.user = decoded;
        next();
    } catch {
        return res.status(401).json({ message: 'Invalid token' });
    }
};

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
    const { username, email, password, referredBy } = req.body;

    if (!username || !email || !password)
      return res.status(400).json({ success: false, message: 'Please provide username, email and password' });

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
      referredBy,
      balance: 0,
      mining: { lastClaimed: new Date(0) },
      kyc: { status: 'pending' },
      referrals: []
    });

    await newUser.save();

    // ✅ ReferredBy Logic (but reward only after KYC + Deposit)
    if (referredBy) {
      const referrer = await User.findOne({ username: referredBy });
      if (referrer) {
        referrer.referrals.push({ username });
        await referrer.save();
      }
    }

    // Send welcome email (optional)
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
});
// ✅ Leaderboard Route
app.get('/leaderboard', async (req, res) => {
  try {
    const topUsers = await User.find({})
      .sort({ balance: -1 })
      .limit(10)
      .select('username balance -_id');

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
      kyc: user.kyc
    }
  });
});


// WITHDRAW
app.post('/withdraw', authenticate, async (req, res) => {
  try {
    const { amount } = req.body;
    const user = await User.findById(req.user.id);

    if (!user) return res.status(404).json({ message: 'User not found' });

    // ✅ KYC must be verified
    if (user.kyc.status !== 'verified') {
      return res.status(400).json({ message: 'KYC not verified. Please complete your KYC to withdraw.' });
    }

    const withdrawAmount = parseFloat(amount);
    if (isNaN(withdrawAmount) || withdrawAmount < 0.1) {
      return res.status(400).json({ message: 'Minimum withdrawal amount is 0.1 SOL' });
    }

    // ✅ Balance check
    if (user.balance < withdrawAmount) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }

    // ✅ Deduct balance
    user.balance -= withdrawAmount;

    // ✅ Add to reward history
    user.rewardHistory.push({
      date: new Date(),
      type: 'Withdraw',
      amount: -withdrawAmount
    });

    await user.save();

    res.json({
      success: true,
      message: `Withdrawal of ${withdrawAmount} SOL successful`,
      balance: user.balance
    });

  } catch (err) {
    console.error('Withdraw error:', err);
    res.status(500).json({ message: 'Withdraw failed. Please try again later.' });
  }
});

    
// GET /rewards/history - fetch user reward history
app.get('/rewards/history', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      rewards: user.rewardHistory || []
    });
  } catch (error) {
    console.error('Error fetching reward history:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// STAKE
app.post('/stake', authenticate, async (req, res) => {
    const { amount } = req.body;
    if (typeof amount !== 'number' || amount < 1)
        return res.status(400).json({ message: 'Minimum stake is 1 SOL' });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.balance < amount)
        return res.status(400).json({ message: 'Insufficient balance to stake' });

    if (user.staking.amount > 0)
        return res.status(400).json({ message: 'You already have active staking' });

    user.balance -= amount;
    user.staking.amount = amount;
    user.staking.startTime = new Date();
    user.staking.lastClaimed = new Date();
    await user.save();

    res.json({ message: `Staked ${amount} SOL for 30 days`, staking: user.staking });
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
    await user.save();

    res.json({ message: `Claimed ${reward.toFixed(4)} SOL staking rewards`, newBalance: user.balance });
});

// KYC SUBMISSION - Only if balance >= 0.01 SOL
app.post('/kyc/submit', authenticate, upload.single('selfie'), async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (user.kyc.status === 'verified')
            return res.status(400).json({ message: 'KYC already verified' });

        if (user.balance < 0.01)
            return res.status(400).json({ message: 'You must deposit at least 0.01 SOL to apply for KYC' });

        if (user.kyc.retryAfter && new Date() < user.kyc.retryAfter) {
            const daysLeft = Math.ceil((user.kyc.retryAfter - new Date()) / (1000 * 60 * 60 * 24));
            return res.status(400).json({ message: `Retry KYC after ${daysLeft} day(s)` });
        }

        if (!req.file)
            return res.status(400).json({ message: 'Selfie image is required' });

        user.kyc.imagePath = req.file.path;
        user.kyc.submittedAt = new Date();
        user.kyc.status = 'pending';
        user.kyc.verificationStartedAt = new Date();
        await user.save();

        res.json({ message: 'KYC selfie submitted. Verification started. You have 5 minutes to complete.' });
    } catch (err) {
        console.error('KYC submit error:', err);
        res.status(500).json({ message: 'KYC submission error' });
    }
});

// KYC VERIFICATION - Must verify within 5 minutes
app.post('/kyc/verify', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (user.kyc.status === 'verified')
            return res.status(400).json({ message: 'KYC already verified' });

        if (!user.kyc.verificationStartedAt)
            return res.status(400).json({ message: 'No selfie found. Please submit KYC first' });

        const now = new Date();
        const timeDiff = now - new Date(user.kyc.verificationStartedAt);
        if (timeDiff > 5 * 60 * 1000) {
            user.kyc.status = 'failed';
            user.kyc.retryAfter = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
            await user.save();
            return res.status(400).json({ message: 'KYC time expired (5 mins). Retry after 3 days' });
        }

        // Simulate AI/face match
        const isVerified = Math.random() > 0.2;

        if (isVerified) {
            user.kyc.status = 'verified';
            user.kyc.verificationStartedAt = null;
            await user.save();
            return res.json({ message: 'KYC verified successfully' });
        } else {
            user.kyc.status = 'failed';
            user.kyc.retryAfter = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
            await user.save();
            return res.status(400).json({ message: 'Verification failed. Retry after 3 days' });
        }

    } catch (err) {
        console.error('KYC verify error:', err);
        res.status(500).json({ message: 'KYC verification error' });
    }
});

// MINING REWARD CLAIM (FINAL LOGIC)
app.post('/mine/claim', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const now = new Date();
    const lastClaim = user.mining.lastClaimed || new Date(0);

    const maxMiningDurationMs = 3 * 60 * 60 * 1000; // 3 گھنٹے
    const diffMs = now - lastClaim;

    // جتنا وقت گزرا ہے، اور زیادہ سے زیادہ 3 گھنٹے سے زیادہ نہ ہو
    const eligibleMs = Math.min(diffMs, maxMiningDurationMs);

    if (eligibleMs <= 0) {
      return res.status(400).json({ message: 'No mining reward available yet.' });
    }

    // پر سیکنڈ ریوارڈ (پورے 3 گھنٹے = 0.00025)
    const rewardPerMs = 0.00025 / maxMiningDurationMs;
    let reward = rewardPerMs * eligibleMs;

    // ✅ Count verified + deposited referrals
    const verifiedReferrals = await User.find({
      username: { $in: user.referrals.map(r => r.username) },
      'kyc.status': 'verified',
      balance: { $gte: 0.01 }
    });

    if (verifiedReferrals.length > 0) {
      reward += reward * 0.05 * verifiedReferrals.length;
    }

    // ✅ Upline reward
    const uplines = await getUplineUsers(user.username, 10);
    for (const upline of uplines) {
      upline.balance += 0.00025;

      upline.rewardHistory.push({
        date: now,
        type: 'Upline Bonus',
        amount: 0.00025
      });

      await upline.save();
    }

    user.balance += reward;
    user.mining.lastClaimed = now;

    // ✅ Reward History
    user.rewardHistory.push({
      date: now,
      type: 'Mining',
      amount: reward
    });

    await user.save();

    res.json({
      success: true,
      message: `You mined ${reward.toFixed(6)} SOL!`,
      earned: reward.toFixed(6),
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

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
const corsOptions = {
  origin: [
    'https://solanafuturemining.web.app',
    'https://solanafuturemining.firebaseapp.com'
  ],
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use('/api', kycRoutes); // Now all KYC endpoints work under /api
app.use(express.json());
app.use('/uploads', express.static('uploads'));
app.use('/admin', adminRoutes);
app.use(express.static(path.join(__dirname, 'public')));

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


// Utility: generate 8-digit code
function generateCode() {
  return Math.floor(10000000 + Math.random() * 90000000).toString();
}

// ✅ Update register route to include code
app.post('/register', async (req, res) => {
  try {
    let { username, email, password, referredBy } = req.body;
    if (!username || !email || !password)
      return res.status(400).json({ success: false, message: 'Please provide username, email and password' });

    username = username.trim();
    email = email.trim();

    const existingEmail = await User.findOne({ email });
    if (existingEmail)
      return res.status(400).json({ success: false, message: 'Email already exists' });

    const existingUsername = await User.findOne({ username });
    if (existingUsername)
      return res.status(400).json({ success: false, message: 'Username already exists' });

    const hashed = await bcrypt.hash(password, 10);
    const wallet = Keypair.generate();
    const emailCode = generateCode();

    const newUser = new User({
      username,
      email,
      password: hashed,
      solanaWallet: {
        publicKey: wallet.publicKey.toString(),
        secretKey: Buffer.from(wallet.secretKey).toString('base64')
      },
      referredBy: null,
      balance: 0,
      mining: { lastClaimed: new Date(0) },
        kyc: { status: 'not_submitted' }, // ✅ Correct
      referrals: [],
      isVerified: false,
      emailCode
    });

    if (referredBy) {
      const referrer = await User.findOne({ username: referredBy.trim() });
      if (referrer) {
        newUser.referredBy = referrer._id;
        referrer.referrals.push({ username: newUser.username });
        await referrer.save();
      }
    }

    await newUser.save();

    await transporter.sendMail({
      from: `Solana App <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Your Solana Verification Code',
      html: `<p>Hi ${username},</p><p>Your verification code is: <b>${emailCode}</b></p>`
    });

    res.status(201).json({ success: true, message: 'Registered. Please check your email for verification code.' });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ✅ POST /verify-code
app.post('/verify-code', async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code)
      return res.status(400).json({ success: false, message: 'Email and code required' });

    const user = await User.findOne({ email });
    if (!user)
      return res.status(404).json({ success: false, message: 'User not found' });

    if (user.isVerified)
      return res.status(400).json({ success: false, message: 'User already verified' });

    if (user.emailCode !== code)
      return res.status(400).json({ success: false, message: 'Invalid verification code' });

    user.isVerified = true;
    user.emailCode = undefined;
    await user.save();

    res.json({ success: true, message: 'Verification successful' });
  } catch (err) {
    console.error('Verify error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


app.post('/mine/start', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.mining.sessionStart = new Date();
    user.mining.lastClaimed = new Date();
    user.mining.isMiningActive = true;

    await user.save();

    res.json({ success: true, message: "🚀 Mining session started successfully!" });

  } catch (err) {
    console.error("Error in /mine/start:", err);
    res.status(500).json({ message: "Server error while starting mining session." });
  }
});


// ✅ Referrals Route (Updated with correct frontend domain if needed in future use)
app.get('/referrals', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).lean();
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const referrals = user.referrals || [];

    const formattedReferrals = await Promise.all(referrals.map(async ref => {
      if (!ref.username) return null;

      const referredUser = await User.findOne({ username: ref.username }).lean();
      const kycStatus = referredUser?.kyc?.status || 'not_submitted';
      const reward = kycStatus === 'approved' ? 0.01 : 0;

      return {
        username: ref.username,
        reward,
        kycStatus,
        referralLink: `https://solanafuturemining.web.app/register.html?ref=${ref.username}`
      };
    }));

    res.json({ success: true, referrals: formattedReferrals.filter(Boolean) });

  } catch (err) {
    console.error("🔥 Referral route error:", err);
    res.status(500).json({ success: false, message: "Server error loading referrals" });
  }
});

// ✅ Email Verification Endpoint
app.get('/verify-email', async (req, res) => {
  const { token } = req.query;
  const user = await User.findOne({ emailToken: token });

  if (!user) return res.status(400).send('❌ Invalid or expired verification link.');

  user.isVerified = true;
  user.emailToken = undefined;
  await user.save();

  // ✅ Automatically redirect to dashboard after verification
  res.redirect('https://solanafuturemining.web.app/dashboard.html');
});


// ✅ Leaderboard Route (Fixed)
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

    // ⛔ Check if email is verified
    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        message: 'Please verify your email before logging in.'
      });
    }

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
  try {
    const user = await User.findById(req.user.id).lean();
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    // ✅ Total referral reward from history
    const referralReward = (user.rewardHistory || [])
      .filter(r => r.type.toLowerCase().includes("referral") && r.status === "Success")
      .reduce((sum, r) => sum + r.amount, 0);

    // ✅ Total staking reward from history
    const stakingReward = (user.rewardHistory || [])
      .filter(r => r.type.toLowerCase().includes("staking") && r.status === "Success")
      .reduce((sum, r) => sum + r.amount, 0);

    res.json({
      success: true,
      user: {
        username: user.username,
        email: user.email,
        balance: parseFloat((user.balance || 0).toFixed(5)),
        referralReward: parseFloat(referralReward.toFixed(5)),
        stakingReward: parseFloat(stakingReward.toFixed(5)),
        totalStaked: user.totalStaked || 0,

        solanaWallet: {
          publicKey: user.solanaWallet?.publicKey || ""
        },

        referredBy: user.referredBy || null,
        referrals: user.referrals || [],

        kyc: {
          status: user.kyc?.status || "not_submitted",
          imagePath: user.kyc?.imagePath || null,
          submittedAt: user.kyc?.submittedAt || null,
          verifiedAt: user.kyc?.verifiedAt || null
        },

        rewardHistory: user.rewardHistory || []
      }
    });
  } catch (err) {
    console.error("Profile route error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ WITHDRAW Route (Updated)
app.post('/withdraw', authenticate, async (req, res) => {
  try {
    const { amount, address } = req.body;
    const user = await User.findById(req.user.id);

    if (!user || !user.solanaWallet?.publicKey)
      return res.status(400).json({ message: 'Invalid user or wallet' });

    // ✅ Fix: Check for 'approved' instead of 'verified'
    if (user.kyc.status !== 'approved')
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
      amount: withdrawAmount,
      status: 'Pending'
    });

    await user.save();

    const request = new WithdrawRequest({
      user: user._id, // ✅ corrected field name (user, not userId)
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
// ✅ Stake Route - Multiple staking entries with referrer 10% reward
app.post('/stake', authenticate, async (req, res) => {
  const { amount } = req.body;

  if (!amount || amount < 0.1) {
    return res.status(400).json({ success: false, message: "❌ Minimum stake is 0.1 SOL" });
  }

  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ success: false, message: "❌ User not found" });

  if (user.balance < amount) {
    return res.status(400).json({ success: false, message: "❌ Insufficient balance" });
  }

  // ✅ Deduct balance and stake
  user.balance -= amount;
  user.stakingEntries.push({
    amount,
    startDate: new Date(),
    lastClaimed: new Date(),
    rewardEarned: 0,
    isUnstaked: false
  });
  user.totalStaked += amount;

  user.rewardHistory.push({
    type: 'Stake Start',
    amount,
    status: 'Success',
    date: new Date()
  });

  // ✅ Give 10% to referrer every time
  if (user.referredBy) {
    const referrer = await User.findById(user.referredBy);
    if (referrer) {
      const rewardAmount = amount * 0.10;
      referrer.balance += rewardAmount;

      referrer.rewardHistory.push({
        date: new Date(),
        type: `Referral Bonus (10% of ${user.username}'s stake)`,
        amount: rewardAmount,
        status: "Success"
      });

      await referrer.save();

      console.log(`[BONUS] ${referrer.username} earned ${rewardAmount} from ${user.username}'s stake`);
    }
  }

  await user.save();

  return res.json({
    success: true,
    message: `✅ You have successfully staked ${amount} SOL. Daily 4% reward will start.`,
    balance: user.balance,
    stakingEntries: user.stakingEntries
  });
});


// ✅ Claim Daily Staking Rewards (4%) for All Active Stakes
app.post('/stake/claim', authenticate, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  const now = new Date();
  let totalReward = 0;
  let anyClaimed = false;

  for (let stake of user.stakingEntries) {
    if (stake.isUnstaked) continue;

    const lastClaimed = new Date(stake.lastClaimed);
    const hoursDiff = (now - lastClaimed) / (1000 * 60 * 60);
    if (hoursDiff >= 24) {
      const reward = stake.amount * 0.04;
      stake.lastClaimed = now;
      stake.rewardEarned += reward;
      user.balance += reward;
      totalReward += reward;
      anyClaimed = true;

      user.rewardHistory.push({
        type: 'Staking Daily Reward',
        amount: reward,
        date: now,
        status: 'Success'
      });
    }
  }

  if (!anyClaimed) {
    return res.status(400).json({ message: '⏱️ Claim allowed once every 24 hours per active stake.' });
  }

  user.stakingReward += totalReward;
  await user.save();

  res.json({ success: true, message: `✅ Claimed ${totalReward.toFixed(4)} SOL from all eligible stakes.` });
});


// ✅ Unstake Route - With earned reward after 7 days
app.post('/unstake', authenticate, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  const now = new Date();
  let unstakedAmount = 0;
  let totalRewardAdded = 0;

  user.stakingEntries.forEach(entry => {
    const days = (now - new Date(entry.startDate)) / (1000 * 60 * 60 * 24);

    if (!entry.isUnstaked && days >= 7) {
      entry.isUnstaked = true;
      entry.unstakedAt = now;

      // ✅ Add staked amount back
      user.balance += entry.amount;
      unstakedAmount += entry.amount;

      // ✅ Also add earned reward to balance
      if (entry.rewardEarned && entry.rewardEarned > 0) {
        user.balance += entry.rewardEarned;
        totalRewardAdded += entry.rewardEarned;

        user.rewardHistory.push({
          type: 'Stake Reward Collected on Unstake',
          amount: entry.rewardEarned,
          date: now,
          status: 'Success'
        });
      }

      user.rewardHistory.push({
        type: 'Unstake',
        amount: entry.amount,
        date: now,
        status: 'Success'
      });
    }
  });

  if (unstakedAmount === 0) {
    return res.status(400).json({ message: '❌ No stake available for unstaking yet (wait 7 days)' });
  }

  await user.save();

  return res.json({
    success: true,
    message: `✅ Unstaked ${unstakedAmount} SOL + ${totalRewardAdded.toFixed(4)} SOL reward.`,
    newBalance: user.balance
  });
});


app.post('/mine/claim', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const now = new Date();
    const sessionStart = user.mining.sessionStart;
    const lastClaim = user.mining.lastClaimed || sessionStart;

    if (!sessionStart) {
      return res.status(400).json({ message: '❌ Mining session not started.' });
    }

    const maxMiningDurationMs = 3 * 60 * 60 * 1000; // 3 hours
    const elapsedTotalMs = now - sessionStart;
    const elapsedSinceLastClaimMs = now - lastClaim;

    if (elapsedTotalMs > maxMiningDurationMs) {
      // ❌ Auto-stop after 3h
      user.mining.sessionStart = null;
      user.isMiningActive = false;
      await user.save();
      return res.status(400).json({ message: '⛔ Mining session expired after 3 hours.' });
    }

    if (elapsedSinceLastClaimMs < 60 * 1000) {
      return res.status(400).json({ message: '⏳ Please wait 1 minute between claims.' });
    }

    const rewardPerMs = 0.00025 / maxMiningDurationMs;
    const earned = rewardPerMs * elapsedSinceLastClaimMs;

    // ✅ Optional: Boost calculation
    const verifiedReferrals = await User.find({
      username: { $in: user.referrals.map(r => r.username) },
      'kyc.status': 'approved',
      balance: { $gte: 0.01 }
    });

    const boostPercent = 0.05 * verifiedReferrals.length;
    const boostedReward = earned * boostPercent;
    const totalReward = earned + boostedReward;

    user.balance = (user.balance || 0) + totalReward;
    user.mining.lastClaimed = now;

    user.rewardHistory.push({
      date: now,
      type: 'Mining',
      amount: totalReward,
      status: 'Success'
    });

    await user.save();

    res.json({
      success: true,
      message: `✅ Claimed ${totalReward.toFixed(8)} SOL (Boost: ${boostPercent * 100}%)`,
      earned: totalReward.toFixed(8),
      balance: user.balance.toFixed(8)
    });

  } catch (err) {
    console.error("⛔ Error in /mine/claim:", err);
    res.status(500).json({ message: '⚠️ Error during claim' });
  }
});

app.post('/kyc/live-submit', authenticate, upload.single('selfie'), async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!req.file) return res.status(400).json({ message: 'Selfie file is required' });

    if (user.balance < 0.01) {
      return res.status(400).json({ message: 'Minimum 0.01 SOL required for KYC' });
    }

    user.kyc.imagePath = req.file.path;
    user.kyc.status = 'pending';
    user.kyc.submittedAt = new Date();
    await user.save();

    res.json({ success: true, message: '✅ Selfie submitted successfully. You’ll get verified within 3 hours.' });
  } catch (err) {
    console.error('Live KYC error:', err);
    res.status(500).json({ success: false, message: '❌ Server error during KYC submission' });
  }
});
// ✅ Reward History Route
app.get('/rewards/history', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('rewardHistory');
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    res.json({
      success: true,
      history: (user.rewardHistory || []).reverse()
    });
  } catch (err) {
    console.error("Reward history error:", err);
    res.status(500).json({ success: false, message: "Failed to load reward history" });
  }
});
// ✅ GET all active staking entries
app.get('/rewards/history', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('rewardHistory balance');
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    res.json({
      success: true,
      balance: user.balance || 0, // ✅ Include balance
      history: (user.rewardHistory || []).reverse()
    });
  } catch (err) {
    console.error("Reward history error:", err);
    res.status(500).json({ success: false, message: "Failed to load reward history" });
  }
});


// ✅ RESEND CODE
app.post('/resend-code', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user)
      return res.status(404).json({ success: false, message: 'User not found' });

    if (user.isVerified)
      return res.status(400).json({ success: false, message: 'User is already verified' });

    const newCode = Math.floor(10000000 + Math.random() * 90000000).toString();
    user.emailCode = newCode;
    await user.save();

    await transporter.sendMail({
      from: `Solana App <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Your New Verification Code',
      html: `<p>Your new verification code is: <b>${newCode}</b></p>`
    });

    res.json({ success: true, message: 'New code sent to email' });
  } catch (err) {
    console.error('Resend code error:', err);
    res.status(500).json({ success: false, message: 'Server error while resending code' });
  }
});


app.get('/unstake/list', authenticate, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ message: "User not found" });

  // Get only active stakes
  const activeStakes = user.stakingEntries.filter(entry => !entry.isUnstaked);

  res.json({
    success: true,
    stakes: activeStakes
  });
});


const PORT = process.env.PORT || 3005;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});

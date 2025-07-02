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


app.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Email exist check
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Password hash
    const hashedPassword = await bcrypt.hash(password, 10);

    // User creation
    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      solanaWallet: {
        publicKey: '',
        secretKey: ''
      },
      balance: 0
    });

    await newUser.save();

    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    console.error('Register Error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


    // ✅ Referral Handling Inside Async Function
    if (referredBy) {
      const referrer = await User.findOne({ username: referredBy.trim() });
      if (referrer) {
        newUser.referredBy = referrer.username;
        referrer.referrals.push({
          username: newUser.username,
          referredAt: new Date(),
          rewarded: false
        });
        await referrer.save();
      }
    }

    await newUser.save();

    // ✅ Email verification
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

app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ success: false, message: 'Email and password are required' });

    const user = await User.findOne({ email });
    if (!user)
      return res.status(404).json({ success: false, message: 'User not found' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ success: false, message: 'Invalid credentials' });

    // ✅ Update lastActiveAt on successful login
    user.lastActiveAt = new Date();
    await user.save();

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      message: 'Login successful',
      token
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Server error during login' });
  }
});


// ✅ START MINING
app.post('/mine/start', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const now = new Date();

    user.mining.sessionStart = now;
    user.mining.lastClaimed = now;
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


app.get('/profile', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const now = new Date();
    let totalStakingReward = 0;

    for (let entry of user.stakingEntries) {
      if (!entry.isUnstaked) {
        const lastClaimed = new Date(entry.lastClaimed || entry.startDate);
        const elapsedMs = now - lastClaimed;

        const sixHourMs = 6 * 60 * 60 * 1000;
        const twentyFourHourMs = 24 * 60 * 60 * 1000;

        const maxClaims = 4; // 1% * 4 = 4%
        const rewardPerClaim = entry.amount * 0.01;

        const totalClaims = Math.floor(elapsedMs / sixHourMs);
        const allowedClaims = Math.min(totalClaims, maxClaims); // cap to 4 claims (4%)

        if (allowedClaims > 0) {
          const reward = rewardPerClaim * allowedClaims;
          const timeToAdd = allowedClaims * sixHourMs;

          entry.lastClaimed = new Date(lastClaimed.getTime() + timeToAdd);
          entry.rewardEarned = (entry.rewardEarned || 0) + reward;
          user.balance += reward;
          totalStakingReward += reward;

          user.rewardHistory.push({
            date: now,
            type: 'Staking',
            amount: reward,
            status: 'Success'
          });
        }
      }
    }

    if (totalStakingReward > 0) {
      await user.save();
    }

    // Prepare final clean user object for frontend
    const leanUser = user.toObject();

    const referralReward = (leanUser.rewardHistory || [])
      .filter(r => r.type.toLowerCase().includes("referral") && r.status === "Success")
      .reduce((sum, r) => sum + r.amount, 0);

    const stakingReward = (leanUser.rewardHistory || [])
      .filter(r => r.type.toLowerCase().includes("staking") && r.status === "Success")
      .reduce((sum, r) => sum + r.amount, 0);

    res.json({
      success: true,
      user: {
        username: leanUser.username,
        email: leanUser.email,
        balance: parseFloat((leanUser.balance || 0).toFixed(5)),
        referralReward: parseFloat(referralReward.toFixed(5)),
        stakingReward: parseFloat(stakingReward.toFixed(5)),
        totalStaked: leanUser.totalStaked || 0,

        solanaWallet: {
          publicKey: leanUser.solanaWallet?.publicKey || ""
        },

        referredBy: leanUser.referredBy || null,
        referrals: leanUser.referrals || [],

        kyc: {
          status: leanUser.kyc?.status || "not_submitted",
          imagePath: leanUser.kyc?.imagePath || null,
          submittedAt: leanUser.kyc?.submittedAt || null,
          verifiedAt: leanUser.kyc?.verifiedAt || null
        },

        rewardHistory: leanUser.rewardHistory || [],

        mining: {
          sessionStart: leanUser.mining?.sessionStart || null,
          isMiningActive: leanUser.mining?.isMiningActive || false
        }
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


// ✅ Claim 1% per 6 hours (up to 4% in 24h) for all active stakes
app.post('/stake/claim', authenticate, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  const now = new Date();
  let totalReward = 0;
  let anyClaimed = false;

  for (let stake of user.stakingEntries) {
    if (stake.isUnstaked) continue;

    const lastClaimed = new Date(stake.lastClaimed || stake.startDate);
    const elapsedMs = now - lastClaimed;

    const sixHourMs = 6 * 60 * 60 * 1000;
    const maxClaims = 4; // Max 4 per 24h = 4%
    const rewardPerClaim = stake.amount * 0.01;

    const claimableCount = Math.floor(elapsedMs / sixHourMs);
    const allowedClaims = Math.min(claimableCount, maxClaims); // Don't exceed 4 claims (4%)

    if (allowedClaims > 0) {
      const reward = rewardPerClaim * allowedClaims;

      stake.lastClaimed = new Date(lastClaimed.getTime() + (allowedClaims * sixHourMs));
      stake.rewardEarned += reward;
      user.balance += reward;
      totalReward += reward;
      anyClaimed = true;

      user.rewardHistory.push({
        type: 'Staking',
        amount: reward,
        date: now,
        status: 'Success'
      });
    }
  }

  if (!anyClaimed) {
    return res.status(400).json({ message: '⏱️ You can only claim 1% every 6 hours per stake. No stake eligible yet.' });
  }

  user.stakingReward += totalReward;
  await user.save();

  res.json({
    success: true,
    message: `✅ Claimed ${totalReward.toFixed(4)} SOL staking reward.`,
    amount: totalReward.toFixed(4),
    balance: user.balance.toFixed(4)
  });
});


app.post('/unstake', authenticate, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  const now = new Date();
  let unstakedAmount = 0;
  let totalRewardAdded = 0;
  let totalPenalty = 0;
  let anyUnstaked = false;

  user.stakingEntries.forEach(entry => {
    if (!entry.isUnstaked) {
      const days = (now - new Date(entry.startDate)) / (1000 * 60 * 60 * 24);
      entry.isUnstaked = true;
      entry.unstakedAt = now;
      anyUnstaked = true;

      // ✅ Always return the original stake
      user.balance += entry.amount;
      unstakedAmount += entry.amount;

      if (days >= 7) {
        // ✅ Eligible for full reward
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
      } else {
        // ⛔ Penalty: Remove reward from balance if early unstake
        if (entry.rewardEarned && entry.rewardEarned > 0) {
          user.balance -= entry.rewardEarned;
          totalPenalty += entry.rewardEarned;

          user.rewardHistory.push({
            type: 'Early Unstake Penalty',
            amount: -entry.rewardEarned,
            date: now,
            status: 'Success'
          });

          entry.rewardEarned = 0;
        }
      }

      user.rewardHistory.push({
        type: 'Unstake',
        amount: entry.amount,
        date: now,
        status: 'Success'
      });
    }
  });

  if (!anyUnstaked) {
    return res.status(400).json({ message: '❌ No stake entries available to unstake.' });
  }

  await user.save();

  res.json({
    success: true,
    message: `✅ Unstaked ${unstakedAmount} SOL` +
             (totalRewardAdded > 0 ? ` + ${totalRewardAdded.toFixed(4)} SOL reward` : '') +
             (totalPenalty > 0 ? ` (-${totalPenalty.toFixed(4)} SOL penalty for early unstake)` : ''),
    balance: user.balance.toFixed(4)
  });
});


// ✅ CLAIM REWARD
app.post('/mine/claim', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const now = new Date();
    const sessionStart = user.mining.sessionStart;
    const lastClaim = user.mining.lastClaimed || sessionStart;

    // ❌ No mining session
    if (!sessionStart || !user.mining.isMiningActive) {
      return res.status(400).json({ message: '❌ Mining session not started.' });
    }

    const maxMiningDurationMs = 3 * 60 * 60 * 1000; // 3 hours
    const elapsedSinceStart = now - new Date(sessionStart);

    // ⛔ Auto-stop mining session if expired
    if (elapsedSinceStart > maxMiningDurationMs) {
      user.mining.isMiningActive = false;
      user.mining.sessionStart = null;
      await user.save();
      return res.status(400).json({ message: '⛔ Mining session expired after 3 hours.' });
    }

    const elapsedSinceLastClaimMs = now - new Date(lastClaim);
    const minimumClaimGap = 10 * 1000; // 10 seconds

    if (elapsedSinceLastClaimMs < minimumClaimGap) {
      return res.status(400).json({ message: `⏳ Please wait at least 10 seconds between claims.` });
    }

    // ⚙️ Calculate time-based reward
    const rewardPerMs = 0.00025 / maxMiningDurationMs; // total 0.00025 SOL in 3 hours
    const earned = rewardPerMs * elapsedSinceLastClaimMs;

    // 🔥 Optional Boost
    const verifiedReferrals = await User.find({
      username: { $in: user.referrals.map(r => r.username) },
      'kyc.status': 'approved',
      balance: { $gte: 0.01 }
    });

    const boostPercent = 0.05 * verifiedReferrals.length;
    const boostedReward = earned * boostPercent;
    const totalReward = earned + boostedReward;

    // 💾 Update User
    user.balance = (user.balance || 0) + totalReward;
    user.mining.lastClaimed = now;
    user.mining.sessionStart = now; // 🔁 Reset 3-hour timer
    user.mining.isMiningActive = true;

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

app.get('/my-deposit', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('totalDeposit');
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({ totalDeposit: user.totalDeposit || 0 });
  } catch (err) {
    console.error('Error fetching deposit:', err);
    res.status(500).json({ message: "Failed to fetch deposit data" });
  }
});

app.get('/my-withdraw', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('totalWithdraw');
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({ totalWithdraw: user.totalWithdraw || 0 });
  } catch (err) {
    console.error('Error fetching withdraw:', err);
    res.status(500).json({ message: "Failed to fetch withdraw data" });
  }
});

app.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email)
      return res.status(400).json({ success: false, message: "Email is required" });

    const user = await User.findOne({ email });

    if (!user)
      return res.status(404).json({ success: false, message: "User not found" });

    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetCode = resetCode;
    user.resetCodeExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes expiry
    await user.save();

    await transporter.sendMail({
      from: `Solana App <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Password Reset Code',
      html: `<p>Your password reset code is: <b>${resetCode}</b></p><p>This code will expire in 15 minutes.</p>`
    });

    res.json({ success: true, message: '🔐 Reset code sent to your email' });

  } catch (err) {
    console.error('Forgot Password error:', err);
    res.status(500).json({ success: false, message: 'Server error while sending reset code' });
  }
});

app.post('/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword)
      return res.status(400).json({ success: false, message: "All fields required" });

    const user = await User.findOne({ email });

    if (!user || user.resetCode !== code)
      return res.status(400).json({ success: false, message: "Invalid code or email" });

    if (new Date() > new Date(user.resetCodeExpires))
      return res.status(400).json({ success: false, message: "Code expired. Request a new one." });

    const hashed = await bcrypt.hash(newPassword, 10);
    user.password = hashed;
    user.resetCode = undefined;
    user.resetCodeExpires = undefined;
    await user.save();

    res.json({ success: true, message: "✅ Password reset successfully" });

  } catch (err) {
    console.error('Reset Password error:', err);
    res.status(500).json({ success: false, message: 'Server error while resetting password' });
  }
});

app.post('/send-reset-code', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email is required' });

  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ message: 'User not found' });

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  user.emailCode = code;
  await user.save();

  // Email sending logic (you must have nodemailer configured)
  await transporter.sendMail({
    to: user.email,
    subject: "Your Password Reset Code",
    html: `<h3>Your verification code is: <b>${code}</b></h3>`
  });

  return res.status(200).json({ message: 'Verification code sent to email' });
});


// ✅ Health Check
app.get('/', (req, res) => {
  res.send('Solana Mining App Backend Running ✅');
});

const PORT = process.env.PORT || 3005;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

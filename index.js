require('dotenv').config();

const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Keypair } = require('@solana/web3.js');
const multer = require('multer');
const fs = require('fs');
const nodemailer = require('nodemailer');
const app = express();
const wallet = Keypair.generate();
const { Connection, PublicKey, LAMPORTS_PER_SOL, SystemProgram, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');
const crypto = require('crypto');
const cors = require('cors');

// Email transporter setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Solana connection
const connection = new Connection(
  process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com", 
  'confirmed'
);

// Middleware
const allowedOrigins = [
  'https://solana-future-24bf1.web.app',
  'https://solana-future-24bf1.firebaseapp.com',
  'https://solana-future.onrender.com',
  'http://localhost:3005'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.options('*', cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
    dbName: 'soldatabase',
}).then(() => {
    console.log('✅ MongoDB connected');
}).catch(err => console.error('❌ MongoDB error:', err));

// User Schema with email verification fields
const userSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    email: { 
        type: String, 
        unique: true, 
        required: true,
        validate: {
            validator: function(v) {
                return /^[\w-]+(\.[\w-]+)*@([\w-]+\.)+[a-zA-Z]{2,7}$/.test(v);
            },
            message: props => `${props.value} is not a valid email address!`
        }
    },
    password: { type: String, required: true },
    emailVerified: { type: Boolean, default: false },
    verificationCode: String,
    verificationCodeExpires: Date,
    solanaWallet: {
        publicKey: String,
        secretKey: String,
    },
    referredBy: String,
    balance: { type: Number, default: 0 },
    staking: {
        amount: { type: Number, default: 0 },
        startTime: Date,
        lastClaimed: Date,
    },
    kyc: {
        status: { type: String, default: 'pending' },
        imagePath: String,
        submittedAt: Date,
        retryAfter: Date,
        verificationStartedAt: Date,
    },
    mining: {
        lastClaimed: Date,
    },
    referrals: [{ username: String }],
});

const User = mongoose.model('User', userSchema);

// Authentication middleware
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

// File upload setup
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

// Referral chain calculator
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

// Updated Registration Route with Proper Verification Flow
app.post('/register', async (req, res) => {
    try {
        const { username, email, password, referredBy } = req.body;
        if (!username || !email || !password)
            return res.status(400).json({ 
                success: false,
                message: 'Please provide username, email, and password'
            });

        const existingEmail = await User.findOne({ email });
        if (existingEmail) return res.status(400).json({ 
            success: false,
            message: 'Email already exists'
        });

        const existingUsername = await User.findOne({ username });
        if (existingUsername) return res.status(400).json({ 
            success: false,
            message: 'Username already taken'
        });

        const hashed = await bcrypt.hash(password, 10);
        const wallet = Keypair.generate();
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const verificationCodeExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        const newUser = new User({
            username,
            email,
            password: hashed,
            emailVerified: false,
            verificationCode,
            verificationCodeExpires,
            solanaWallet: {
                publicKey: wallet.publicKey.toString(),
                secretKey: Buffer.from(wallet.secretKey).toString('base64'),
            },
            referredBy,
            balance: 0,
            mining: {
                lastClaimed: new Date(0),
            },
            kyc: {
                status: 'pending',
            },
            referrals: [],
        });

        await newUser.save();

        // Send verification email
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Your Verification Code',
            text: `Hello ${username},\nYour verification code is: ${verificationCode}\nThis code expires in 10 minutes.`
        });

        // Referral rewards
        if (referredBy) {
            const referrer = await User.findOne({ username: referredBy });
            if (referrer) {
                referrer.balance += 0.01;
                referrer.referrals.push({ username });
                await referrer.save();

                const uplines = await getUplineUsers(referredBy, 10);
                for (let upline of uplines) {
                    upline.balance += 0.01;
                    await upline.save();
                }
            }
        }

        res.status(201).json({ 
            success: true,
            message: 'Registration successful. Please check your email for the verification code.',
            requiresVerification: true,
            verificationEmailSent: true,
            nextStep: 'verify_email'
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ 
            success: false,
            message: 'Server error'
        });
    }
});

// Email Verification Route
app.post('/verify-email', async (req, res) => {
    try {
        const { email, code } = req.body;
        if (!email || !code) {
            return res.status(400).json({ 
                success: false,
                message: 'Email and verification code required'
            });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ 
                success: false,
                message: 'User not found'
            });
        }

        if (user.emailVerified) {
            return res.status(400).json({ 
                success: false,
                message: 'Email already verified'
            });
        }

        if (user.verificationCode !== code) {
            return res.status(400).json({ 
                success: false,
                message: 'Invalid verification code'
            });
        }

        if (new Date() > user.verificationCodeExpires) {
            return res.status(400).json({ 
                success: false,
                message: 'Verification code expired'
            });
        }

        // Complete verification
        user.emailVerified = true;
        user.verificationCode = undefined;
        user.verificationCodeExpires = undefined;
        await user.save();

        // Create token and log user in
        const token = jwt.sign(
            { id: user._id, username: user.username }, 
            process.env.JWT_SECRET || 'secretKey', 
            { expiresIn: '7d' }
        );

        res.json({ 
            success: true,
            message: 'Email verified successfully!',
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                emailVerified: true
            }
        });

    } catch (err) {
        console.error('Email verification error:', err);
        res.status(500).json({ 
            success: false,
            message: 'Server error during email verification'
        });
    }
});

// Resend Verification Code Route
app.post('/resend-verification', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ 
                success: false,
                message: 'Email is required'
            });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ 
                success: false,
                message: 'User not found'
            });
        }

        if (user.emailVerified) {
            return res.status(400).json({ 
                success: false,
                message: 'Email already verified'
            });
        }

        // Generate new code
        const newCode = Math.floor(100000 + Math.random() * 900000).toString();
        user.verificationCode = newCode;
        user.verificationCodeExpires = new Date(Date.now() + 10 * 60 * 1000);
        await user.save();

        // Send new email
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Your New Verification Code',
            text: `Hello ${user.username},\nYour new verification code is: ${newCode}\nThis code expires in 10 minutes.`
        });

        res.json({ 
            success: true,
            message: 'New verification code sent to your email'
        });

    } catch (err) {
        console.error('Resend verification error:', err);
        res.status(500).json({ 
            success: false,
            message: 'Failed to resend verification code'
        });
    }
});

// Updated Login Route with Verification Check
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password)
            return res.status(400).json({ 
                success: false,
                message: 'Please provide email and password'
            });

        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ 
            success: false,
            message: 'Invalid email or password'
        });

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(400).json({ 
            success: false,
            message: 'Invalid email or password'
        });

        // Strict verification check
        if (!user.emailVerified) {
            // Option to resend verification code
            const canResend = !user.verificationCodeExpires || 
                            new Date() > new Date(user.verificationCodeExpires);

            return res.status(403).json({ 
                success: false,
                message: 'Please verify your email first',
                requiresVerification: true,
                email: user.email,
                canResendVerification: canResend,
                nextStep: 'verify_email'
            });
        }

        const token = jwt.sign(
            { id: user._id, username: user.username }, 
            process.env.JWT_SECRET || 'secretKey', 
            { expiresIn: '7d' }
        );

        res.json({ 
            success: true,
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                emailVerified: user.emailVerified
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ 
            success: false,
            message: 'Server error'
        });
    }
});

// [Rest of your existing routes remain exactly the same]
// PROFILE, DEPOSIT, WITHDRAW, STAKE, STAKE/CLAIM, KYC, MINING, etc.

// SOL Deposit Verification
app.post('/deposit/verify', async (req, res) => {
  const { txHash, publicKey } = req.body;
  
  try {
    const tx = await connection.getTransaction(txHash);
    const recipient = tx.transaction.message.accountKeys[1].toString();
    
    if (recipient !== publicKey) {
      return res.status(400).json({ error: "Transaction sent to wrong wallet!" });
    }

    const amount = (tx.meta.postBalances[1] - tx.meta.preBalances[1]) / LAMPORTS_PER_SOL;
    res.json({ success: true, amount });
  } catch (error) {
    res.status(500).json({ error: "Failed to verify transaction!" });
  }
});

// SOL Withdrawal
app.post('/withdraw/sol', async (req, res) => {
  const { secretKey, recipientAddress, amount } = req.body;
  
  try {
    const fromWallet = Keypair.fromSecretKey(
      Buffer.from(secretKey, 'base64')
    );
    
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: fromWallet.publicKey,
        toPubkey: new PublicKey(recipientAddress),
        lamports: amount * LAMPORTS_PER_SOL,
      })
    );

    const txHash = await sendAndConfirmTransaction(connection, transaction, [fromWallet]);
    res.json({ success: true, txHash });
  } catch (error) {
    res.status(500).json({ error: "Withdrawal failed!" });
  }
});

// Profile
app.get('/profile', authenticate, async (req, res) => {
    const user = await User.findById(req.user.id).select('-password -solanaWallet.secretKey');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
});

// Deposit
app.post('/deposit', authenticate, async (req, res) => {
    const { amount } = req.body;
    if (typeof amount !== 'number' || amount < 0.3)
        return res.status(400).json({ message: 'Minimum deposit is 0.3 SOL' });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.balance += amount;
    await user.save();

    res.json({ message: `${amount} SOL deposited`, newBalance: user.balance });
});

// Withdrawal
app.post('/withdraw', authenticate, async (req, res) => {
    const { amount } = req.body;
    if (typeof amount !== 'number' || amount < 0.3)
        return res.status(400).json({ message: 'Minimum withdrawal is 0.3 SOL' });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.balance < amount)
        return res.status(400).json({ message: 'Insufficient balance' });

    user.balance -= amount;
    await user.save();

    res.json({ message: `${amount} SOL withdrawn`, newBalance: user.balance });
});

// Stake
app.post('/stake', authenticate, async (req, res) => {
    const { amount } = req.body;
    if (typeof amount !== 'number' || amount < 0.5)
        return res.status(400).json({ message: 'Minimum stake is 0.5 SOL' });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.balance < amount)
        return res.status(400).json({ message: 'Insufficient balance for staking' });

    if (user.staking.amount > 0)
        return res.status(400).json({ message: 'You already have an active stake' });

    user.balance -= amount;
    user.staking.amount = amount;
    user.staking.startTime = new Date();
    user.staking.lastClaimed = new Date();
    await user.save();

    res.json({ message: `${amount} SOL staked for 30 days`, staking: user.staking });
});

// Staking Reward Claim
app.post('/stake/claim', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (!user.staking || user.staking.amount === 0) {
            return res.status(400).json({ message: 'You have no active staking' });
        }

        const now = new Date();
        const lastClaimed = user.staking.lastClaimed || user.staking.startTime;
        const daysStaked = Math.floor((now - lastClaimed) / (1000 * 60 * 60 * 24));

        if (daysStaked < 1) {
            return res.status(400).json({ message: 'You can claim staking rewards once per day' });
        }

        const stakingDuration = now - new Date(user.staking.startTime);
        if (stakingDuration < 30 * 24 * 60 * 60 * 1000) {
            const daysRemaining = 30 - Math.floor(stakingDuration / (1000 * 60 * 60 * 24));
            return res.status(400).json({ message: `30 days not completed, ${daysRemaining} days remaining` });
        }

        const reward = user.staking.amount * 0.02 * daysStaked;

        user.balance += reward;
        user.staking.lastClaimed = now;
        await user.save();

        res.json({
            message: `✅ You claimed ${reward.toFixed(4)} SOL staking reward`,
            newBalance: user.balance
        });

    } catch (error) {
        console.error('Staking claim error:', error);
        res.status(500).json({ message: 'Error claiming reward' });
    }
});

// KYC Selfie Submission
app.post('/kyc/submit', authenticate, upload.single('image'), async (req, res) => {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const now = new Date();

    if (user.kyc.retryAfter && user.kyc.retryAfter > now) {
        return res.status(400).json({ message: 'Retry allowed after: ' + user.kyc.retryAfter });
    }

    user.kyc.imagePath = req.file.path;
    user.kyc.status = 'pending';
    user.kyc.submittedAt = now;
    user.kyc.verificationStartedAt = now;

    await user.save();

    res.json({ message: 'KYC submitted, verification started' });
});

// KYC Status Check
app.get('/kyc/status', authenticate, async (req, res) => {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({ kyc: user.kyc });
});

// KYC Verification + 3-level Referral Reward
app.post('/kyc/verify', authenticate, async (req, res) => {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.kyc.status === 'verified') return res.status(400).json({ message: 'KYC already verified' });
    if (!user.kyc.verificationStartedAt) return res.status(400).json({ message: 'No KYC selfie submitted' });

    const now = new Date();
    const diffMs = now - user.kyc.verificationStartedAt;
    if (diffMs > 5 * 60 * 1000) {
        user.kyc.status = 'failed';
        user.kyc.retryAfter = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
        await user.save();
        return res.status(400).json({ message: 'Verification took longer than 5 minutes. Retry after 3 days.' });
    }

    const isVerified = Math.random() > 0.2;

    if (isVerified) {
        user.kyc.status = 'verified';
        user.kyc.verificationStartedAt = null;

        if (user.referredBy) {
            const ref1 = await User.findOne({ _id: user.referredBy });
            if (ref1) {
                ref1.balance += 0.01;
                await ref1.save();

                if (ref1.referredBy) {
                    const ref2 = await User.findOne({ _id: ref1.referredBy });
                    if (ref2) {
                        ref2.balance += 0.005;
                        await ref2.save();

                        if (ref2.referredBy) {
                            const ref3 = await User.findOne({ _id: ref2.referredBy });
                            if (ref3) {
                                ref3.balance += 0.0025;
                                await ref3.save();
                            }
                        }
                    }
                }
            }
        }

        await user.save();
        return res.json({ message: 'KYC verified successfully! Referral rewards distributed.' });

    } else {
        user.kyc.status = 'failed';
        user.kyc.retryAfter = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
        await user.save();
        return res.status(400).json({ message: 'Verification failed. Retry after 3 days.' });
    }
});

// Mining Reward Claim
app.post('/mine/claim', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const now = new Date();

        if (!user.mining) user.mining = {};

        const lastClaim = user.mining.lastClaimed || new Date(0);
        const diffMs = now - lastClaim;

        if (diffMs < 3 * 60 * 60 * 1000) {
            return res.status(400).json({ message: 'You can claim mining rewards every 3 hours' });
        }

        let reward = 0.00075;

        if (user.referrals && user.referrals.length > 0) {
            const referralUsernames = user.referrals.map(r => typeof r === 'string' ? r : r.username);
            const verifiedReferralCount = await User.countDocuments({
                username: { $in: referralUsernames },
                'kyc.status': 'verified'
            });

            if (verifiedReferralCount > 0) {
                reward += reward * 0.05 * verifiedReferralCount;
            }
        }

        user.balance += reward;
        user.mining.lastClaimed = now;
        await user.save();

        res.json({
            message: `You mined ${reward.toFixed(4)} SOL!`,
            balance: user.balance
        });

    } catch (error) {
        console.error('Mining reward error:', error);
        res.status(500).json({ message: 'Error claiming mining reward.' });
    }
});

// Start server
const PORT = process.env.PORT || 3005;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});

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
app.use(cors({
  origin: [
    'https://solana-future-24bf1.web.app',
    'https://solana-future-24bf1.firebaseapp.com',
    'http://localhost:3000'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
    dbName: 'soldatabase',
}).then(() => {
    console.log('✅ MongoDB connected');
}).catch(err => console.error('❌ MongoDB error:', err));

// Enhanced User Schema with email verification
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
    const token = req.headers.authorization?.split(' ')[1] || req.headers.authorization;
    if (!token) return res.status(401).json({ message: 'Unauthorized - Token missing' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secretKey');
        req.user = decoded;
        next();
    } catch (ex) {
        res.status(401).json({ message: 'Invalid token' });
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

// Helper functions
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

// Routes

// REGISTER with email verification
app.post('/register', async (req, res) => {
    try {
        const { username, email, password, referredBy } = req.body;
        if (!username || !email || !password)
            return res.status(400).json({ message: 'Please provide username, email and password' });

        const existingEmail = await User.findOne({ email });
        if (existingEmail) return res.status(400).json({ message: 'Email already exists' });

        const existingUsername = await User.findOne({ username });
        if (existingUsername) return res.status(400).json({ message: 'Username already exists' });

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
            subject: 'Verify Your Email',
            text: `Your verification code is: ${verificationCode}`
        });

        // Referral rewards (existing logic)
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
            message: 'Registered successfully. Please check your email for verification code.',
            requiresVerification: true
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// EMAIL VERIFICATION
app.post('/verify-email', async (req, res) => {
    try {
        const { email, code } = req.body;
        if (!email || !code) {
            return res.status(400).json({ message: 'Email and verification code are required' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (user.emailVerified) {
            return res.status(400).json({ message: 'Email already verified' });
        }

        if (user.verificationCode !== code) {
            return res.status(400).json({ message: 'Invalid verification code' });
        }

        if (new Date() > user.verificationCodeExpires) {
            return res.status(400).json({ message: 'Verification code has expired' });
        }

        user.emailVerified = true;
        user.verificationCode = undefined;
        user.verificationCodeExpires = undefined;
        await user.save();

        res.json({ message: 'Email verified successfully!' });

    } catch (err) {
        console.error('Email verification error:', err);
        res.status(500).json({ message: 'Server error during email verification' });
    }
});

// RESEND VERIFICATION CODE
app.post('/resend-verification', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (user.emailVerified) {
            return res.status(400).json({ message: 'Email already verified' });
        }

        const newCode = Math.floor(100000 + Math.random() * 900000).toString();
        user.verificationCode = newCode;
        user.verificationCodeExpires = new Date(Date.now() + 10 * 60 * 1000);
        await user.save();

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Your New Verification Code',
            text: `Your new verification code is: ${newCode}`
        });

        res.json({ message: 'New verification code sent to your email' });

    } catch (err) {
        console.error('Resend verification error:', err);
        res.status(500).json({ message: 'Failed to resend verification code' });
    }
});

// LOGIN with email verification check
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password)
            return res.status(400).json({ message: 'Please provide email and password' });

        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ message: 'Invalid email or password' });

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(400).json({ message: 'Invalid email or password' });

        if (!user.emailVerified) {
            return res.status(403).json({ 
                message: 'Please verify your email first',
                requiresVerification: true,
                email: user.email
            });
        }

        const token = jwt.sign({ id: user._id, username: user.username }, process.env.JWT_SECRET || 'secretKey', { expiresIn: '7d' });
        res.json({ 
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
        res.status(500).json({ message: 'Server error' });
    }
});

// [ALL YOUR EXISTING ROUTES REMAIN EXACTLY THE SAME]
// PROFILE, DEPOSIT, WITHDRAW, STAKE, STAKE/CLAIM, KYC, MINING, etc.
// ... (Include all your existing routes here exactly as they were)

// Start server
const PORT = process.env.PORT || 3005;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});

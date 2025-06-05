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


app.use(express.static(path.join(__dirname, 'public')));
const cors = require('cors');

const allowedOrigins = [
  'https://solana-future-24bf1.web.app', // Firebase frontend
  'http://localhost:3000'                // (Dev testing if needed)
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

app.options('*', cors()); // Pre-flight requests


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

// User schema with referral levels, staking and mining info
const userSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
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
        status: { type: String, default: 'pending' }, // pending, verified, failed
        imagePath: String,
        submittedAt: Date,
        retryAfter: Date,
        verificationStartedAt: Date, // to track 5 minutes limit
    },
    mining: {
        lastClaimed: Date,
    },
    referrals: [{ username: String }], // direct referrals usernames for tracking
});
const User = mongoose.model('User', userSchema);

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

// Helper: Calculate referral chain (up to 10 levels)
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
            return res.status(400).json({ message: 'Please provide username, email and password' });

        const existingEmail = await User.findOne({ email });
        if (existingEmail) return res.status(400).json({ message: 'Email already exists' });

        const existingUsername = await User.findOne({ username });
        if (existingUsername) return res.status(400).json({ message: 'Username already exists' });

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
            balance: 0, // starting balance 0; referral rewards handled separately
            mining: {
                lastClaimed: new Date(0), // set to epoch so mining reward is available immediately
            },
            kyc: {
                status: 'pending',
            },
            referrals: [],
        });

        await newUser.save();

        // Referral rewards on joining
        if (referredBy) {
            const referrer = await User.findOne({ username: referredBy });
            if (referrer) {
                referrer.balance += 0.01; // direct referral reward
                referrer.referrals.push({ username });
                await referrer.save();

                // 10-level upline referral rewards (0.01 SOL each)
                const uplines = await getUplineUsers(referredBy, 10);
                for (let upline of uplines) {
                    upline.balance += 0.01;
                    await upline.save();
                }
            }
        }

        await sendWelcomeEmail(email, username);

        res.status(201).json({ message: 'Registered successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// LOGIN
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password)
            return res.status(400).json({ message: 'Please provide email and password' });

        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ message: 'User not found' });

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(400).json({ message: 'Incorrect password' });

        const token = jwt.sign({ id: user._id, username: user.username }, process.env.JWT_SECRET || 'secretKey', { expiresIn: '7d' });
        res.json({ token });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// PROFILE
app.get('/profile', authenticate, async (req, res) => {
    const user = await User.findById(req.user.id).select('-password -solanaWallet.secretKey');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
});

// DEPOSIT
app.post('/deposit', authenticate, async (req, res) => {
    const { amount } = req.body;
    if (typeof amount !== 'number' || amount < 0.3)
        return res.status(400).json({ message: 'Minimum deposit is 0.3 SOL' });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.balance += amount;
    await user.save();

    res.json({ message: `Deposited ${amount} SOL`, newBalance: user.balance });
});

// WITHDRAW
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

    res.json({ message: `Withdrawn ${amount} SOL`, newBalance: user.balance });
});

// STAKE
app.post('/stake', authenticate, async (req, res) => {
    const { amount } = req.body;
    if (typeof amount !== 'number' || amount < 0.5) // minimum 0.5 SOL staking
        return res.status(400).json({ message: 'Minimum stake is 0.5 SOL' });

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

    // Check 30 days lock period
    if ((now - user.staking.startTime) < 30 * 24 * 60 * 60 * 1000)
        return res.status(400).json({ message: 'Lock period of 30 days not finished yet' });

    const reward = user.staking.amount * 0.02 * daysStaked; // 2% daily reward

    user.balance += reward;
    user.staking.lastClaimed = now;
    await user.save();

    res.json({ message: `Claimed ${reward.toFixed(4)} SOL staking rewards`, newBalance: user.balance });
});

app.post('/kyc/submit', authenticate, upload.single('image'), async (req, res) => {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const now = new Date();

    // Retry cooldown check
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

 app.get('/kyc/status', authenticate, async (req, res) => {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({ kyc: user.kyc });
 });


 setInterval(async () => {
    const now = new Date();
    const pendingUsers = await User.find({ 'kyc.status': 'pending' });

    for (let user of pendingUsers) {
        const submittedAt = user.kyc.verificationStartedAt;
        if (!submittedAt) continue;

        const diff = (now - submittedAt) / 1000 / 60; // minutes

        if (diff > 5) {
            // Simulate failure if not verified in 5 min
            user.kyc.status = 'failed';
            user.kyc.retryAfter = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000); // retry after 3 days
            await user.save();
        } else {
            // Simulate success (for testing)
            user.kyc.status = 'verified';
            await user.save();
        }
    }
 }, 60 * 1000); // run every minute

 // KYC VERIFY (simulate face verification)
 app.post('/kyc/verify', authenticate, async (req, res) => {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.kyc.status === 'verified') return res.status(400).json({ message: 'KYC already verified' });

    if (!user.kyc.verificationStartedAt) return res.status(400).json({ message: 'No KYC selfie submitted' });

    const now = new Date();
    const diffMs = now - user.kyc.verificationStartedAt;
    if (diffMs > 5 * 60 * 1000) {
        user.kyc.status = 'failed';
        user.kyc.retryAfter = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000); // 3 days cooldown
        await user.save();
        return res.status(400).json({ message: 'Verification time exceeded 5 minutes. Retry after 3 days.' });
    }

    // TODO: Replace this block with real face verification logic using external API or ML model.
    // For now simulate success randomly:
    const isVerified = Math.random() > 0.2; // 80% chance success

    if (isVerified) {
        user.kyc.status = 'verified';
        user.kyc.verificationStartedAt = null;
        await user.save();
        return res.json({ message: 'KYC verified successfully!' });
    } else {
        user.kyc.status = 'failed';
        user.kyc.retryAfter = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000); // 3 days cooldown
        await user.save();
        return res.status(400).json({ message: 'Verification failed. Retry after 3 days.' });
    }
});

// MINING REWARD CLAIM
app.post('/mine/claim', authenticate, async (req, res) => {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const now = new Date();
    const lastClaim = user.mining.lastClaimed || new Date(0);
    const diffMs = now - lastClaim;
    if (diffMs < 3 * 60 * 60 * 1000) { // 3 hours
        return res.status(400).json({ message: 'You can claim mining rewards once every 3 hours' });
    }

    // Base reward amount (example fixed or dynamic based on your rules)
    let reward = 0.01; // base mining reward

    // Add referral bonus 5% per direct referral verified
    if (user.referrals.length > 0) {
        const verifiedReferralCount = await User.countDocuments({ username: { $in: user.referrals.map(r => r.username) }, 'kyc.status': 'verified' });
        if (verifiedReferralCount > 0) {
            reward += reward * 0.05 * verifiedReferralCount;
        }
    }

    // Add multi-level referral rewards for uplines (5% per level)
    const uplines = await getUplineUsers(user.username, 10);
    for (const upline of uplines) {
        upline.balance += 0.01; // 10 level referral reward
        await upline.save();
    }

    user.balance += reward;
    user.mining.lastClaimed = now;
    await user.save();

    res.json({ message: `You mined ${reward.toFixed(4)} SOL!`, balance: user.balance });
});

// Start server
const PORT = process.env.PORT || 3005;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});

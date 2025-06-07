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
const wallet = Keypair.generate(); // صارف کے لیے سولانا والیٹ بنائی گئی
const { Connection, PublicKey, LAMPORTS_PER_SOL, SystemProgram, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');
const crypto = require('crypto');



// سولانا نیٹورک سے کنیکٹ کریں (Devnet یا Mainnet)
const connection = new Connection(
  process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com", 
  'confirmed'
);

// حقیقی SOL ڈیپازٹ کی تصدیق
app.post('/deposit/verify', async (req, res) => {
  const { txHash, publicKey } = req.body;
  
  try {
    const tx = await connection.getTransaction(txHash);
    const recipient = tx.transaction.message.accountKeys[1].toString();
    
    if (recipient !== publicKey) {
      return res.status(400).json({ error: "ٹرانزیکشن غلط والیٹ پر گئی ہے!" });
    }

    const amount = (tx.meta.postBalances[1] - tx.meta.preBalances[1]) / LAMPORTS_PER_SOL;
    res.json({ success: true, amount });
  } catch (error) {
    res.status(500).json({ error: "ٹرانزیکشن چیک کرنے میں ناکامی!" });
  }
});

// حقیقی SOL وٹھڈراال
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
    res.status(500).json({ error: "وٹھڈراال ناکام!" });
  }
});
app.use(express.static(path.join(__dirname, 'public')));
const cors = require('cors');

const allowedOrigins = [
  'https://solana-future-24bf1.web.app',
  'https://solana-future-24bf1.firebaseapp.com',
  'http://localhost:3000'
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


// Step 1 & 2: ویریفیکیشن کوڈ جنریٹ اور ای میل کریں
app.post('/send-verification-code', authenticate, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  // رینڈم 6 ہندسوں کا کوڈ
  const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

  // 10 منٹ کا ایکسپائری ٹائم
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  // ڈیٹا بیس میں سیٹ کریں
  user.emailVerification = {
    code: verificationCode,
    expiresAt,
    verified: false
  };
  await user.save();

  // ای میل بھیجیں
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: user.email,
    subject: 'Your Verification Code',
    text: `Hello ${user.username},\nYour verification code is: ${verificationCode}\nIt expires in 10 minutes.`
  };

  try {
    await transporter.sendMail(mailOptions);
    res.json({ message: 'Verification code sent to your email' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to send verification email' });
  }
});

// Step 4: ویریفیکیشن کوڈ کی جانچ پڑتال کریں
app.post('/verify-email-code', authenticate, async (req, res) => {
  const { code } = req.body;
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  if (!user.emailVerification || user.emailVerification.verified)
    return res.status(400).json({ message: 'No verification pending or already verified' });

  if (user.emailVerification.expiresAt < new Date())
    return res.status(400).json({ message: 'Verification code expired' });

  if (user.emailVerification.code !== code)
    return res.status(400).json({ message: 'Invalid verification code' });

  // ویریفائی کر دیں
  user.emailVerification.verified = true;
  await user.save();

  res.json({ message: 'Email verified successfully!' });
});


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

// ✅ اسٹیکنگ ریوارڈ کلیم کریں
app.post('/stake/claim', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'یوزر نہیں ملا' });

        if (!user.staking || user.staking.amount === 0) {
            return res.status(400).json({ message: 'آپ نے ابھی تک کوئی staking نہیں کی' });
        }

        const now = new Date();
        const lastClaimed = user.staking.lastClaimed || user.staking.startTime;
        const daysStaked = Math.floor((now - lastClaimed) / (1000 * 60 * 60 * 24));

        if (daysStaked < 1) {
            return res.status(400).json({ message: 'آپ دن میں ایک بار staking reward حاصل کر سکتے ہیں' });
        }

        const stakingDuration = now - new Date(user.staking.startTime);
        if (stakingDuration < 30 * 24 * 60 * 60 * 1000) {
            const daysRemaining = 30 - Math.floor(stakingDuration / (1000 * 60 * 60 * 24));
            return res.status(400).json({ message: `30 دن مکمل نہیں ہوئے، ${daysRemaining} دن باقی ہیں` });
        }

        const reward = user.staking.amount * 0.02 * daysStaked;

        user.balance += reward;
        user.staking.lastClaimed = now;
        await user.save();

        res.json({
            message: `✅ آپ نے ${reward.toFixed(4)} SOL کا staking reward حاصل کیا`,
            newBalance: user.balance
        });

    } catch (error) {
        console.error('Staking claim error:', error);
        res.status(500).json({ message: 'ریوارڈ کلیم کرتے ہوئے کوئی مسئلہ ہوا' });
    }
});

// Submit KYC selfie
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

// KYC status check
app.get('/kyc/status', authenticate, async (req, res) => {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({ kyc: user.kyc });
});

// KYC verify + 3 level referral reward
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
        return res.status(400).json({ message: 'Verification time exceeded 5 minutes. Retry after 3 days.' });
    }

    const isVerified = Math.random() > 0.2;

    if (isVerified) {
        user.kyc.status = 'verified';
        user.kyc.verificationStartedAt = null;

        // 3 Level Referral Rewards
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
        return res.json({ message: 'KYC verified successfully and referral rewards distributed!' });

    } else {
        user.kyc.status = 'failed';
        user.kyc.retryAfter = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
        await user.save();
        return res.status(400).json({ message: 'Verification failed. Retry after 3 days.' });
    }
});

// ✅ MINING REWARD CLAIM (Without Upline Rewards)
app.post('/mine/claim', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const now = new Date();

        // Ensure mining object exists
        if (!user.mining) user.mining = {};

        const lastClaim = user.mining.lastClaimed || new Date(0);
        const diffMs = now - lastClaim;

        if (diffMs < 3 * 60 * 60 * 1000) {
            return res.status(400).json({ message: 'You can claim mining rewards once every 3 hours' });
        }

        // 🪙 Base mining reward
        let reward = 0.00075;

        // ➕ Referral Bonus: 5% extra per verified referral
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

        // ✅ Update user's reward
        user.balance += reward;
        user.mining.lastClaimed = now;
        await user.save();

        res.json({
            message: `You mined ${reward.toFixed(4)} SOL!`,
            balance: user.balance
        });

    } catch (error) {
        console.error('Mining reward error:', error);
        res.status(500).json({ message: 'An error occurred while claiming mining reward.' });
    }
});


// Start server
const PORT = process.env.PORT || 3005;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});

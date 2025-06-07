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

// ای میل ٹرانسپورٹر سیٹ اپ
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// سولانا کنکشن
const connection = new Connection(
  process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com", 
  'confirmed'
);

// مڈل ویئر
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

// MongoDB کنکشن
mongoose.connect(process.env.MONGO_URI, {
    dbName: 'soldatabase',
}).then(() => {
    console.log('✅ MongoDB connected');
}).catch(err => console.error('❌ MongoDB error:', err));

// یوزر اسکیما میں ای میل تصدیق کے فیلڈز شامل
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
            message: props => `${props.value} درست ای میل ایڈریس نہیں ہے!`
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

// تصدیق مڈل ویئر
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

// فائل اپلوڈ سیٹ اپ
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

// ریفرل چین کیلکولیٹر
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

// رجسٹریشن روٹ میں ای میل تصدیق شامل
app.post('/register', async (req, res) => {
    try {
        const { username, email, password, referredBy } = req.body;
        if (!username || !email || !password)
            return res.status(400).json({ message: 'براہ کرم صارف نام، ای میل اور پاس ورڈ فراہم کریں' });

        const existingEmail = await User.findOne({ email });
        if (existingEmail) return res.status(400).json({ message: 'یہ ای میل پہلے سے موجود ہے' });

        const existingUsername = await User.findOne({ username });
        if (existingUsername) return res.status(400).json({ message: 'یہ صارف نام پہلے سے موجود ہے' });

        const hashed = await bcrypt.hash(password, 10);
        const wallet = Keypair.generate();
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const verificationCodeExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 منٹ

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

        // تصدیقی ای میل بھیجیں
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'آپ کا تصدیقی کوڈ',
            text: `سلام ${username},\nآپ کا تصدیقی کوڈ ہے: ${verificationCode}\nیہ کوڈ 10 منٹ کے لیے درست رہے گا۔`
        });

        // ریفرل ریوارڈز (موجودہ منطق)
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
            message: 'رجسٹریشن کامیاب۔ براہ کرم اپنے ای میل پر تصدیقی کوڈ چیک کریں۔',
            requiresVerification: true
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'سرور میں خرابی' });
    }
});

// ای میل تصدیق کا نیا روٹ
app.post('/verify-email', async (req, res) => {
    try {
        const { email, code } = req.body;
        if (!email || !code) {
            return res.status(400).json({ message: 'ای میل اور تصدیقی کوڈ درکار ہے' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'صارف نہیں ملا' });
        }

        if (user.emailVerified) {
            return res.status(400).json({ message: 'ای میل پہلے ہی تصدیق شدہ ہے' });
        }

        if (user.verificationCode !== code) {
            return res.status(400).json({ message: 'غلط تصدیقی کوڈ' });
        }

        if (new Date() > user.verificationCodeExpires) {
            return res.status(400).json({ message: 'تصدیقی کوڈ کی میعاد ختم ہوگئی ہے' });
        }

        // تصدیق مکمل کریں
        user.emailVerified = true;
        user.verificationCode = undefined;
        user.verificationCodeExpires = undefined;
        await user.save();

        // ٹوکن بنائیں اور لاگ ان کروائیں
        const token = jwt.sign(
            { id: user._id, username: user.username }, 
            process.env.JWT_SECRET || 'secretKey', 
            { expiresIn: '7d' }
        );

        res.json({ 
            message: 'ای میل تصدیق کامیاب!',
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                emailVerified: true
            }
        });

    } catch (err) {
        console.error('ای میل تصدیق میں خرابی:', err);
        res.status(500).json({ message: 'ای میل تصدیق کے دوران سرور میں خرابی' });
    }
});

// تصدیقی کوڈ دوبارہ بھیجنے کا روٹ
app.post('/resend-verification', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ message: 'ای میل درکار ہے' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'صارف نہیں ملا' });
        }

        if (user.emailVerified) {
            return res.status(400).json({ message: 'ای میل پہلے ہی تصدیق شدہ ہے' });
        }

        // نیا کوڈ جنریٹ کریں
        const newCode = Math.floor(100000 + Math.random() * 900000).toString();
        user.verificationCode = newCode;
        user.verificationCodeExpires = new Date(Date.now() + 10 * 60 * 1000);
        await user.save();

        // نیا ای میل بھیجیں
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'آپ کا نیا تصدیقی کوڈ',
            text: `سلام ${user.username},\nآپ کا نیا تصدیقی کوڈ ہے: ${newCode}\nیہ کوڈ 10 منٹ کے لیے درست رہے گا۔`
        });

        res.json({ message: 'نیا تصدیقی کوڈ آپ کے ای میل پر بھیج دیا گیا ہے' });

    } catch (err) {
        console.error('تصدیقی کوڈ دوبارہ بھیجنے میں خرابی:', err);
        res.status(500).json({ message: 'تصدیقی کوڈ دوبارہ بھیجنے میں ناکامی' });
    }
});

// لاگ ان روٹ میں تصدیق کی شرط شامل
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password)
            return res.status(400).json({ message: 'براہ کرم ای میل اور پاس ورڈ فراہم کریں' });

        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ message: 'غلط ای میل یا پاس ورڈ' });

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(400).json({ message: 'غلط ای میل یا پاس ورڈ' });

        if (!user.emailVerified) {
            return res.status(403).json({ 
                message: 'براہ کرم پہلے اپنے ای میل کی تصدیق کریں',
                requiresVerification: true,
                email: user.email
            });
        }

        const token = jwt.sign(
            { id: user._id, username: user.username }, 
            process.env.JWT_SECRET || 'secretKey', 
            { expiresIn: '7d' }
        );

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
        res.status(500).json({ message: 'سرور میں خرابی' });
    }
});

// [یہاں آپ کے تمام موجودہ روٹس بالکل ویسے ہی رہیں گے]
// PROFILE, DEPOSIT, WITHDRAW, STAKE, STAKE/CLAIM, KYC, MINING, etc.

// SOL ڈیپازٹ کی تصدیق
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

// SOL وٹھڈراال
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

// پروفائل
app.get('/profile', authenticate, async (req, res) => {
    const user = await User.findById(req.user.id).select('-password -solanaWallet.secretKey');
    if (!user) return res.status(404).json({ message: 'صارف نہیں ملا' });
    res.json(user);
});

// ڈیپازٹ
app.post('/deposit', authenticate, async (req, res) => {
    const { amount } = req.body;
    if (typeof amount !== 'number' || amount < 0.3)
        return res.status(400).json({ message: 'کم از کم ڈیپازٹ 0.3 SOL ہے' });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'صارف نہیں ملا' });

    user.balance += amount;
    await user.save();

    res.json({ message: `${amount} SOL ڈیپازٹ کر دیا گیا`, newBalance: user.balance });
});

// وٹھڈراال
app.post('/withdraw', authenticate, async (req, res) => {
    const { amount } = req.body;
    if (typeof amount !== 'number' || amount < 0.3)
        return res.status(400).json({ message: 'کم از کم وٹھڈراال 0.3 SOL ہے' });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'صارف نہیں ملا' });

    if (user.balance < amount)
        return res.status(400).json({ message: 'ناکافی بیلنس' });

    user.balance -= amount;
    await user.save();

    res.json({ message: `${amount} SOL وٹھڈراال کر لیا گیا`, newBalance: user.balance });
});

// اسٹیک
app.post('/stake', authenticate, async (req, res) => {
    const { amount } = req.body;
    if (typeof amount !== 'number' || amount < 0.5)
        return res.status(400).json({ message: 'کم از کم اسٹیک 0.5 SOL ہے' });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'صارف نہیں ملا' });

    if (user.balance < amount)
        return res.status(400).json({ message: 'اسٹیک کرنے کے لیے ناکافی بیلنس' });

    if (user.staking.amount > 0)
        return res.status(400).json({ message: 'آپ پہلے ہی فعال اسٹیکنگ کر چکے ہیں' });

    user.balance -= amount;
    user.staking.amount = amount;
    user.staking.startTime = new Date();
    user.staking.lastClaimed = new Date();
    await user.save();

    res.json({ message: `${amount} SOL 30 دنوں کے لیے اسٹیک کر دیا گیا`, staking: user.staking });
});

// اسٹیکنگ ریوارڈ کلیم
app.post('/stake/claim', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'صارف نہیں ملا' });

        if (!user.staking || user.staking.amount === 0) {
            return res.status(400).json({ message: 'آپ نے ابھی تک کوئی اسٹیکنگ نہیں کی' });
        }

        const now = new Date();
        const lastClaimed = user.staking.lastClaimed || user.staking.startTime;
        const daysStaked = Math.floor((now - lastClaimed) / (1000 * 60 * 60 * 24));

        if (daysStaked < 1) {
            return res.status(400).json({ message: 'آپ دن میں ایک بار اسٹیکنگ ریوارڈ حاصل کر سکتے ہیں' });
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
            message: `✅ آپ نے ${reward.toFixed(4)} SOL کا اسٹیکنگ ریوارڈ حاصل کیا`,
            newBalance: user.balance
        });

    } catch (error) {
        console.error('اسٹیکنگ کلیم میں خرابی:', error);
        res.status(500).json({ message: 'ریوارڈ کلیم کرتے ہوئے کوئی مسئلہ ہوا' });
    }
});

// KYC سلفی جمع کروائیں
app.post('/kyc/submit', authenticate, upload.single('image'), async (req, res) => {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'صارف نہیں ملا' });

    const now = new Date();

    if (user.kyc.retryAfter && user.kyc.retryAfter > now) {
        return res.status(400).json({ message: 'دوبارہ کوشش کی اجازت: ' + user.kyc.retryAfter });
    }

    user.kyc.imagePath = req.file.path;
    user.kyc.status = 'pending';
    user.kyc.submittedAt = now;
    user.kyc.verificationStartedAt = now;

    await user.save();

    res.json({ message: 'KYC جمع کروائی گئی، تصدیق شروع ہو گئی' });
});

// KYC کی حیثیت چیک کریں
app.get('/kyc/status', authenticate, async (req, res) => {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'صارف نہیں ملا' });

    res.json({ kyc: user.kyc });
});

// KYC تصدیق کریں + 3 سطحی ریفرل ریوارڈ
app.post('/kyc/verify', authenticate, async (req, res) => {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'صارف نہیں ملا' });

    if (user.kyc.status === 'verified') return res.status(400).json({ message: 'KYC پہلے ہی تصدیق شدہ ہے' });
    if (!user.kyc.verificationStartedAt) return res.status(400).json({ message: 'کوئی KYC سلفی جمع نہیں ہوئی' });

    const now = new Date();
    const diffMs = now - user.kyc.verificationStartedAt;
    if (diffMs > 5 * 60 * 1000) {
        user.kyc.status = 'failed';
        user.kyc.retryAfter = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
        await user.save();
        return res.status(400).json({ message: 'تصدیق کا وقت 5 منٹ سے زیادہ ہو گیا۔ 3 دن بعد دوبارہ کوشش کریں۔' });
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
        return res.json({ message: 'KYC کامیابی سے تصدیق ہو گئی اور ریفرل ریوارڈز تقسیم کر دیے گئے!' });

    } else {
        user.kyc.status = 'failed';
        user.kyc.retryAfter = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
        await user.save();
        return res.status(400).json({ message: 'تصدیق ناکام۔ 3 دن بعد دوبارہ کوشش کریں۔' });
    }
});

// مائننگ ریوارڈ کلیم
app.post('/mine/claim', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'صارف نہیں ملا' });

        const now = new Date();

        if (!user.mining) user.mining = {};

        const lastClaim = user.mining.lastClaimed || new Date(0);
        const diffMs = now - lastClaim;

        if (diffMs < 3 * 60 * 60 * 1000) {
            return res.status(400).json({ message: 'آپ ہر 3 گھنٹے میں ایک بار مائننگ ریوارڈ حاصل کر سکتے ہیں' });
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
            message: `آپ نے ${reward.toFixed(4)} SOL مائن کر لیے!`,
            balance: user.balance
        });

    } catch (error) {
        console.error('مائننگ ریوارڈ میں خرابی:', error);
        res.status(500).json({ message: 'مائننگ ریوارڈ کلیم کرتے ہوئے کوئی مسئلہ ہوا۔' });
    }
});

// سرور شروع کریں
const PORT = process.env.PORT || 3005;
app.listen(PORT, () => {
    console.log(`🚀 سرور پورٹ ${PORT} پر چل رہا ہے`);
});

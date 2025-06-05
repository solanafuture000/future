const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

// KYC Schema
const kycSchema = new mongoose.Schema({
  username: { type: String, required: true },
  status: { type: String, default: 'pending' }, // pending, verified, failed
  selfiePath: { type: String },
  startTime: { type: Date, default: Date.now },
  retryAfter: { type: Date, default: null },
});

const KYC = mongoose.model('KYC', kycSchema);

const app = express();
const PORT = process.env.PORT || 3005;

// Middlewares
app.use(cors());
app.use(express.json());  // JSON body parsing middleware
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB connection - اپنے MongoDB URI یہاں ڈالیں
const mongoURI = 'YOUR_MONGODB_URI_HERE';

mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected'))
.catch((err) => console.error('MongoDB connection error:', err));

// Serve frontend index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API to create new KYC record
app.post('/api/kyc', async (req, res) => {
  try {
    const { username, selfiePath } = req.body;
    const newKyc = new KYC({ username, selfiePath });
    await newKyc.save();
    res.status(201).json({ message: 'KYC record created', kyc: newKyc });
  } catch (error) {
    console.error('Error creating KYC:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// API to get all KYC records
app.get('/api/kyc', async (req, res) => {
  try {
    const kycs = await KYC.find();
    res.json(kycs);
  } catch (error) {
    console.error('Error fetching KYC:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

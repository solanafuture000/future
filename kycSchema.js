const mongoose = require('mongoose');

// KYC کی سکیمہ بنائیں
const kycSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  selfieVerified: { type: Boolean, default: false },
  verificationTimestamp: { type: Date },
});

const KYC = mongoose.model('KYC', kycSchema);

module.exports = KYC;
U
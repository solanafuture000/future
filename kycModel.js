const mongoose = require('mongoose');

const kycSchema = new mongoose.Schema({
  username: { type: String, required: true },
  status: { type: String, default: 'pending' }, // pending, verified, failed
  selfiePath: { type: String },
  startTime: { type: Date, default: Date.now },
  retryAfter: { type: Date, default: null },
});

module.exports = mongoose.model('KYC', kycSchema);

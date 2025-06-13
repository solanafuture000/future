const mongoose = require('mongoose');

const withdrawRequestSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  walletAddress: { type: String, required: true },
  amount: { type: Number, required: true },
  status: { type: String, default: 'pending' }, // pending, approved, rejected
  requestedAt: { type: Date, default: Date.now },
  processedAt: { type: Date }
});

module.exports = mongoose.model('WithdrawRequest', withdrawRequestSchema);

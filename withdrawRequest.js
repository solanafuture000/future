const mongoose = require('mongoose');

const withdrawRequestSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  walletAddress: String,
  amount: Number,
  status: { type: String, default: 'pending' }, // pending, approved, rejected
  requestedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('WithdrawRequest', withdrawRequestSchema);

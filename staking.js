const mongoose = require('mongoose');

// Staking Schema
const stakingSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true }, // Staked amount in SOL
  stakeDate: { type: Date, default: Date.now },
  lastRewardDate: { type: Date, default: Date.now },
});

// Staking ماڈل بنائیں
const Staking = mongoose.model('Staking', stakingSchema);

// 🔁 یوزر کو روزانہ reward دیں (0.5% of amount)
async function giveDailyStakingRewards() {
  const now = new Date();

  const allStakes = await Staking.find();

  for (const stake of allStakes) {
    const lastReward = new Date(stake.lastRewardDate);
    const oneDay = 1000 * 60 * 60 * 24;

    if (now - lastReward >= oneDay) {
      const reward = stake.amount * 0.005; // 0.5% daily reward

      // متعلقہ یوزر کو تلاش کریں
      const User = mongoose.model('User'); // avoid circular dependency
      const user = await User.findById(stake.userId);

      if (user) {
        user.balance += reward;
        await user.save();

        stake.lastRewardDate = now;
        await stake.save();
      }
    }
  }
}

module.exports = {
  Staking,
  giveDailyStakingRewards,
};

// depositMonitor.js
require('dotenv').config();
const mongoose = require('mongoose');
const { Connection, PublicKey } = require('@solana/web3.js');
const User = require('./User');

const connection = new Connection('https://api.mainnet-beta.solana.com');
const appWallet = new PublicKey('YOUR_APP_PUBLIC_KEY'); // ✅ Replace with your app's Solana public key

mongoose.connect(process.env.MONGO_URI, {
  dbName: 'soldatabase'
}).then(() => {
  console.log('✅ MongoDB connected');
  checkDeposits();
  setInterval(checkDeposits, 60000); // check every 60 seconds
}).catch(err => console.error('❌ MongoDB Error:', err));

async function checkDeposits() {
  try {
    const signatures = await connection.getSignaturesForAddress(appWallet, { limit: 20 });

    for (const sig of signatures) {
      const tx = await connection.getTransaction(sig.signature, { commitment: 'confirmed' });
      if (!tx || !tx.meta) continue;

      const sender = tx.transaction.message.accountKeys[0].toBase58();
      const amountLamports = tx.meta.postBalances[1] - tx.meta.preBalances[1];
      const amountSOL = amountLamports / 1e9;

      if (amountSOL <= 0) continue;

      const alreadyLogged = await User.findOne({ 'depositHistory.txId': sig.signature });
      if (alreadyLogged) continue;

      const user = await User.findOne({ 'solanaWallet.publicKey': sender });
      if (!user) continue;

      user.balance += amountSOL;
      user.depositHistory = user.depositHistory || [];
      user.depositHistory.push({
        txId: sig.signature,
        amount: amountSOL,
        sender,
        receivedAt: new Date()
      });

      await user.save();
      console.log(`✅ ${user.username} received ${amountSOL} SOL`);
    }
  } catch (err) {
    console.error('🔥 Error checking deposits:', err);
  }
}

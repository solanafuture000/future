// depositMonitor.js
require('dotenv').config();
const mongoose = require('mongoose');
const { Connection, PublicKey } = require('@solana/web3.js');
const User = require('./User');

const connection = new Connection('https://api.mainnet-beta.solana.com');

mongoose.connect(process.env.MONGO_URI, {
  dbName: 'soldatabase',
}).then(() => {
  console.log('✅ MongoDB connected');
  checkUserDeposits();
  setInterval(checkUserDeposits, 60000); // Check every 1 minute
}).catch(err => console.error('❌ MongoDB Error:', err));

async function checkUserDeposits() {
  try {
    const users = await User.find({});

    for (const user of users) {
      if (!user.solanaWallet?.publicKey) continue;

      const walletAddress = new PublicKey(user.solanaWallet.publicKey);
      const signatures = await connection.getSignaturesForAddress(walletAddress, { limit: 5 });

      for (const sig of signatures) {
        const alreadyLogged = user.depositHistory?.some(entry => entry.txId === sig.signature);
        if (alreadyLogged) continue;

        const tx = await connection.getTransaction(sig.signature, { commitment: 'confirmed' });
        if (!tx || !tx.meta) continue;

        const pre = tx.meta.preBalances[0];
        const post = tx.meta.postBalances[0];
        const lamports = post - pre;
        const amountSOL = lamports / 1e9;

        if (amountSOL <= 0) continue;

        const sender = tx.transaction.message.accountKeys[1].toBase58();

        user.balance += amountSOL;
        user.depositHistory = user.depositHistory || [];
        user.depositHistory.push({
          txId: sig.signature,
          amount: amountSOL,
          sender,
          receivedAt: new Date()
        });

        await user.save();
        console.log(`✅ ${user.username} deposited ${amountSOL} SOL`);
      }
    }
  } catch (err) {
    console.error('🔥 Error checking user deposits:', err);
  }
}

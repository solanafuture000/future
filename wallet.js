const { Keypair, Connection, clusterApiUrl, LAMPORTS_PER_SOL } = require('@solana/web3.js');

// نیا والٹ بنانے والا فنکشن
function generateWallet() {
  const wallet = Keypair.generate();
  return {
    publicKey: wallet.publicKey.toString(),
    secretKey: Buffer.from(wallet.secretKey).toString('hex'),
  };
}

// بیلنس چیک کرنے والا فنکشن
async function getWalletBalance(publicKeyString) {
  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
  try {
    const balance = await connection.getBalance(publicKeyString);
    return balance / LAMPORTS_PER_SOL;
  } catch (error) {
    console.error("بیلنس چیک کرنے میں مسئلہ:", error);
    return null;
  }
}

module.exports = {
  generateWallet,
  getWalletBalance
};

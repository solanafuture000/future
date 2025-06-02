import './App.css';

function App() {
  return (
    <div style={{ 
      background: '#000428', 
      color: '#fff', 
      minHeight: '100vh', 
      padding: '2rem', 
      fontFamily: 'sans-serif' 
    }}>
      <h1 style={{ color: '#00FFA3', textAlign: 'center' }}>
        Welcome to Solana VIP Mining App
      </h1>
      <div style={{ textAlign: 'center', marginTop: '2rem' }}>
        <img src="/images/solana.png" alt="Solana" width="100" />
        <div style={{ marginTop: '1rem' }}>
          <img src="/images/usdc.png" alt="USDC" width="60" />
          <img src="/images/ray.png" alt="RAY" width="60" />
          <img src="/images/stepn.png" alt="STEPN" width="60" />
        </div>
      </div>
    </div>
  );
}

export default App;

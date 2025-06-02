import React, { useState } from 'react';
import axios from 'axios';

function StakingPage() {
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');

  const handleStake = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        'http://localhost:3005/stake',
        { amount },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      setMessage(response.data.message || 'Stake successful!');
    } catch (error) {
      setMessage(
        error.response?.data?.message || 'Staking failed. Please try again.'
      );
    }
  };

  return (
    <div style={styles.container}>
      <h2>Stake SOL</h2>
      <form onSubmit={handleStake} style={styles.form}>
        <input
          type="number"
          step="0.01"
          placeholder="Enter amount in SOL"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
          style={styles.input}
        />
        <button type="submit" style={styles.button}>Stake</button>
      </form>
      {message && <p>{message}</p>}
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '400px',
    margin: 'auto',
    marginTop: '100px',
    padding: '20px',
    border: '1px solid #ccc',
    borderRadius: '10px',
    background: '#f9f9f9',
    textAlign: 'center',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '15px',
  },
  input: {
    padding: '10px',
    fontSize: '16px',
  },
  button: {
    padding: '10px',
    fontSize: '16px',
    background: '#007bff',
    color: '#fff',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
  },
};

export default StakingPage;

import React, { useState } from 'react';
import axios from 'axios';

function WithdrawPage() {
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');

  const handleWithdraw = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        'http://localhost:3005/withdraw',
        { amount },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      setMessage(response.data.message || 'Withdrawal successful!');
    } catch (error) {
      setMessage(
        error.response?.data?.message || 'Withdrawal failed. Please try again.'
      );
    }
  };

  return (
    <div style={styles.container}>
      <h2>Withdraw SOL</h2>
      <form onSubmit={handleWithdraw} style={styles.form}>
        <input
          type="number"
          step="0.01"
          placeholder="Enter amount in SOL"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
          style={styles.input}
        />
        <button type="submit" style={styles.button}>Withdraw</button>
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

export default WithdrawPage;

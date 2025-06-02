import React, { useState } from 'react';
import axios from 'axios';

function KYCPage() {
  const [selfie, setSelfie] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFileChange = (e) => {
    setSelfie(e.target.files[0]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selfie) {
      setMessage('Please upload your selfie.');
      return;
    }

    const formData = new FormData();
    formData.append('selfie', selfie);

    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.post(
        'http://localhost:3005/kyc',
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
            Authorization: `Bearer ${token}`,
          },
        }
      );
      setLoading(false);
      setMessage(response.data.message || 'KYC verification successful!');
    } catch (error) {
      setLoading(false);
      setMessage(
        error.response?.data?.message || 'KYC verification failed. Please try again.'
      );
    }
  };

  return (
    <div style={styles.container}>
      <h2>Submit KYC</h2>
      <form onSubmit={handleSubmit} style={styles.form}>
        <input
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          required
          style={styles.input}
        />
        <button type="submit" style={styles.button} disabled={loading}>
          {loading ? 'Submitting...' : 'Submit KYC'}
        </button>
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

export default KYCPage;

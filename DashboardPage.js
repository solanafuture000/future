import React, { useState, useEffect } from 'react';
import axios from 'axios';

const DashboardPage = () => {
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      axios
        .get('http://localhost:5000/dashboard', {
          headers: { Authorization: `Bearer ${token}` },
        })
        .then((response) => {
          setMessage(response.data.message);
        })
        .catch((error) => {
          setMessage('Unauthorized access');
        });
    } else {
      setMessage('No token found');
    }
  }, []);

  return (
    <div>
      <h1>{message}</h1>
    </div>
  );
};

export default DashboardPage;

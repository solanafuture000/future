// Required dependencies
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

// Create an express app
const app = express();
const port = 3005;

// Use middleware
app.use(cors()); // CORS enabled for cross-origin requests
app.use(bodyParser.json()); // For parsing application/json
app.use(bodyParser.urlencoded({ extended: true })); // For parsing application/x-www-form-urlencoded

// MongoDB connection string (update with your MongoDB URI)
const mongoURI = 'mongodb+srv://soldatabase:Mk8GPj6Eq7IFlgRp@cluster0.knkyfdx.mongodb.net/soldatabase?retryWrites=true&w=majority';

// MongoDB connection
mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log('MongoDB connected successfully!');
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
  });

// Example User schema (modify as needed)
const userSchema = new mongoose.Schema({
  username: String,
  email: String,
  password: String,
  solanaWallet: String,
  balance: { type: Number, default: 0 },
});

const User = mongoose.model('User', userSchema);

// Routes
app.get('/', (req, res) => {
  res.send('Solana Free Mining App Backend is Running!');
});

// Register route (example)
app.post('/register', async (req, res) => {
  try {
    const { username, email, password, solanaWallet } = req.body;
    const newUser = new User({ username, email, password, solanaWallet });
    await newUser.save();
    res.status(200).json({ message: 'User registered successfully!' });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Login route (example)
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email, password });

    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    res.status(200).json({ message: 'Login successful!', user });
  } catch (error) {
    console.error('Error logging in user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Starting the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

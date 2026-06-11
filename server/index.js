require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection (optional - app works with in-memory storage too)
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/voice-interview')
  .then(() => console.log('✅ MongoDB connected successfully'))
  .catch(() => {
    console.log('ℹ️ MongoDB not available - using in-memory storage');
  });

// Basic route
app.get('/', (req, res) => {
  res.json({ message: 'Voice Interview Platform API is running' });
});

// Routes
app.use('/api/users', require('./routes/users'));
app.use('/api/interviews', require('./routes/interviews'));
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/resume', require('./routes/resume'));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

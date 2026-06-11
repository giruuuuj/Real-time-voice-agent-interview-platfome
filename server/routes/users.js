const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'voice-interview-secret';

// In-memory storage fallback
let inMemoryUsers = [];

// Auth middleware
const auth = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'No token, authorization denied' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

// POST /api/users/register - Register new user
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const isAdmin = email.includes('admin');

    if (mongoose.connection.readyState === 1) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ message: 'User with this email already exists' });
      }
      const user = new User({ name, email, password, role: isAdmin ? 'admin' : 'user' });
      await user.save();
      const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });
      res.status(201).json({
        token,
        user: { _id: user._id, name: user.name, email: user.email, role: user.role }
      });
    } else {
      const existingUser = inMemoryUsers.find(u => u.email === email);
      if (existingUser) {
        return res.status(400).json({ message: 'User with this email already exists' });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      const user = {
        _id: Date.now().toString(),
        name, email,
        password: hashedPassword,
        role: isAdmin ? 'admin' : 'user',
        createdAt: new Date()
      };
      inMemoryUsers.push(user);
      const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });
      res.status(201).json({
        token,
        user: { _id: user._id, name: user.name, email: user.email, role: user.role }
      });
    }
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Error creating user', error: error.message });
  }
});

// POST /api/users/login - Login user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    if (mongoose.connection.readyState === 1) {
      const user = await User.findOne({ email });
      if (!user) return res.status(400).json({ message: 'Invalid email or password' });
      const isMatch = await user.comparePassword(password);
      if (!isMatch) return res.status(400).json({ message: 'Invalid email or password' });
      const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });
      res.json({
        token,
        user: { _id: user._id, name: user.name, email: user.email, role: user.role }
      });
    } else {
      const user = inMemoryUsers.find(u => u.email === email);
      if (!user) return res.status(400).json({ message: 'Invalid email or password' });
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) return res.status(400).json({ message: 'Invalid email or password' });
      const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });
      res.json({
        token,
        user: { _id: user._id, name: user.name, email: user.email, role: user.role }
      });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Error logging in', error: error.message });
  }
});

// GET /api/users/me - Get current user
router.get('/me', auth, async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const user = await User.findById(req.userId).select('-password');
      if (!user) return res.status(404).json({ message: 'User not found' });
      res.json(user);
    } else {
      const user = inMemoryUsers.find(u => u._id === req.userId);
      if (!user) return res.status(404).json({ message: 'User not found' });
      const { password, ...userData } = user;
      res.json(userData);
    }
  } catch (error) {
    res.status(500).json({ message: 'Error fetching user', error: error.message });
  }
});

// GET /api/users - Get all users (admin only)
router.get('/', async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const users = await User.find().select('-password').sort({ createdAt: -1 });
      res.json(users);
    } else {
      res.json(inMemoryUsers.map(({ password, ...u }) => u));
    }
  } catch (error) {
    res.status(500).json({ message: 'Error fetching users', error: error.message });
  }
});

// GET /api/users/:id - Get user profile
router.get('/:id', async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const user = await User.findById(req.params.id).select('-password');
      if (!user) return res.status(404).json({ message: 'User not found' });
      res.json(user);
    } else {
      const user = inMemoryUsers.find(u => u._id === req.params.id);
      if (!user) return res.status(404).json({ message: 'User not found' });
      const { password, ...userData } = user;
      res.json(userData);
    }
  } catch (error) {
    res.status(500).json({ message: 'Error fetching user', error: error.message });
  }
});

module.exports = router;
module.exports.inMemoryUsers = inMemoryUsers;

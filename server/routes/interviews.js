const express = require('express');
const router = express.Router();
const Interview = require('../models/Interview');
const mongoose = require('mongoose');

// In-memory storage fallback
let inMemoryInterviews = [
  {
    _id: 'int1',
    title: 'Frontend Developer Interview',
    category: 'tech',
    questions: [
      'Tell me about your experience with React',
      'Explain the difference between state and props',
      'What is the virtual DOM?',
      'How do you handle state management in React?'
    ],
    createdBy: 'admin',
    createdAt: new Date()
  },
  {
    _id: 'int2',
    title: 'Backend Developer Interview',
    category: 'tech',
    questions: [
      'Explain RESTful API design principles',
      'What is Node.js event loop?',
      'How do you handle authentication in APIs?',
      'Describe database indexing'
    ],
    createdBy: 'admin',
    createdAt: new Date()
  },
  {
    _id: 'int3',
    title: 'HR General Interview',
    category: 'HR',
    questions: [
      'Tell me about yourself',
      'What are your strengths and weaknesses?',
      'Why do you want to work here?',
      'Where do you see yourself in 5 years?'
    ],
    createdBy: 'admin',
    createdAt: new Date()
  },
  {
    _id: 'int4',
    title: 'JavaScript Coding Interview',
    category: 'coding',
    questions: [
      'Write a function to reverse a string',
      'Explain closures in JavaScript',
      'What is the difference between == and ===?',
      'Implement a debounce function'
    ],
    createdBy: 'admin',
    createdAt: new Date()
  }
];

// POST /api/interviews - Create interview template
router.post('/', async (req, res) => {
  try {
    const { title, category, questions, createdBy } = req.body;

    if (mongoose.connection.readyState === 1) {
      const interview = new Interview({ title, category, questions, createdBy });
      await interview.save();
      res.status(201).json({ message: 'Interview created successfully', interview });
    } else {
      const interview = {
        _id: Date.now().toString(),
        title,
        category,
        questions,
        createdBy: createdBy || 'admin',
        createdAt: new Date()
      };
      inMemoryInterviews.push(interview);
      res.status(201).json({ message: 'Interview created successfully', interview });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error creating interview', error: error.message });
  }
});

// GET /api/interviews - List all interviews
router.get('/', async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const interviews = await Interview.find().populate('createdBy', 'name email').sort({ createdAt: -1 });
      res.json(interviews);
    } else {
      res.json(inMemoryInterviews);
    }
  } catch (error) {
    res.status(500).json({ message: 'Error fetching interviews', error: error.message });
  }
});

// GET /api/interviews/:id - Get specific interview
router.get('/:id', async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const interview = await Interview.findById(req.params.id).populate('createdBy', 'name email');
      if (!interview) {
        return res.status(404).json({ message: 'Interview not found' });
      }
      res.json(interview);
    } else {
      const interview = inMemoryInterviews.find(i => i._id === req.params.id);
      if (!interview) {
        return res.status(404).json({ message: 'Interview not found' });
      }
      res.json(interview);
    }
  } catch (error) {
    res.status(500).json({ message: 'Error fetching interview', error: error.message });
  }
});

// DELETE /api/interviews/:id - Delete interview
router.delete('/:id', async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const interview = await Interview.findByIdAndDelete(req.params.id);
      if (!interview) {
        return res.status(404).json({ message: 'Interview not found' });
      }
      res.json({ message: 'Interview deleted successfully' });
    } else {
      const index = inMemoryInterviews.findIndex(i => i._id === req.params.id);
      if (index === -1) {
        return res.status(404).json({ message: 'Interview not found' });
      }
      inMemoryInterviews.splice(index, 1);
      res.json({ message: 'Interview deleted successfully' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error deleting interview', error: error.message });
  }
});

module.exports = router;
module.exports.inMemoryInterviews = inMemoryInterviews;

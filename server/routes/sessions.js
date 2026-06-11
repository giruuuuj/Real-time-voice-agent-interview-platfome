const express = require('express');
const router = express.Router();
const Session = require('../models/Session');
const mongoose = require('mongoose');

// In-memory storage fallback
let inMemorySessions = [];

// POST /api/sessions - Start new interview session
router.post('/', async (req, res) => {
  try {
    const { userId, interviewId, resumeData } = req.body;

    if (mongoose.connection.readyState === 1) {
      const session = new Session({
        userId,
        interviewId,
        transcript: [],
        status: 'in_progress',
        resumeData: resumeData || {}
      });
      await session.save();
      res.status(201).json({ message: 'Session created successfully', session });
    } else {
      const session = {
        _id: Date.now().toString(),
        userId,
        interviewId,
        transcript: [],
        feedback: null,
        score: null,
        status: 'in_progress',
        resumeData: resumeData || {},
        createdAt: new Date()
      };
      inMemorySessions.push(session);
      res.status(201).json({ message: 'Session created successfully', session });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error creating session', error: error.message });
  }
});

// PUT /api/sessions/:id/transcript - Add Q&A to transcript
router.put('/:id/transcript', async (req, res) => {
  try {
    const { role, text, audioUrl } = req.body;

    if (mongoose.connection.readyState === 1) {
      const session = await Session.findById(req.params.id);
      if (!session) {
        return res.status(404).json({ message: 'Session not found' });
      }

      session.transcript.push({
        role,
        text,
        audioUrl: audioUrl || null,
        timestamp: new Date()
      });

      await session.save();
      res.json({ message: 'Transcript updated successfully', session });
    } else {
      const session = inMemorySessions.find(s => s._id === req.params.id);
      if (!session) {
        return res.status(404).json({ message: 'Session not found' });
      }

      session.transcript.push({
        role,
        text,
        audioUrl: audioUrl || null,
        timestamp: new Date()
      });

      res.json({ message: 'Transcript updated successfully', session });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error updating transcript', error: error.message });
  }
});

// PUT /api/sessions/:id/feedback - Save AI feedback
router.put('/:id/feedback', async (req, res) => {
  try {
    const { feedback, score } = req.body;

    if (mongoose.connection.readyState === 1) {
      const session = await Session.findById(req.params.id);
      if (!session) {
        return res.status(404).json({ message: 'Session not found' });
      }

      session.feedback = feedback;
      session.score = score;
      session.status = 'completed';

      await session.save();
      res.json({ message: 'Feedback saved successfully', session });
    } else {
      const session = inMemorySessions.find(s => s._id === req.params.id);
      if (!session) {
        return res.status(404).json({ message: 'Session not found' });
      }

      session.feedback = feedback;
      session.score = score;
      session.status = 'completed';

      res.json({ message: 'Feedback saved successfully', session });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error saving feedback', error: error.message });
  }
});

// GET /api/sessions/shared - Get all shared reports (MUST be before /:id)
router.get('/shared', async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const sessions = await Session.find({ shared: true })
        .populate('userId', 'name email')
        .populate('interviewId', 'title category')
        .sort({ createdAt: -1 });
      res.json(sessions);
    } else {
      const sessions = inMemorySessions.filter(s => s.shared);
      res.json(sessions);
    }
  } catch (error) {
    res.status(500).json({ message: 'Error fetching shared reports', error: error.message });
  }
});

// GET /api/sessions/:id - Get session details
router.get('/:id', async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const session = await Session.findById(req.params.id)
        .populate('userId', 'name email')
        .populate('interviewId', 'title category questions');
      
      if (!session) {
        return res.status(404).json({ message: 'Session not found' });
      }
      res.json(session);
    } else {
      const session = inMemorySessions.find(s => s._id === req.params.id);
      if (!session) {
        return res.status(404).json({ message: 'Session not found' });
      }
      res.json(session);
    }
  } catch (error) {
    res.status(500).json({ message: 'Error fetching session', error: error.message });
  }
});

// GET /api/sessions - Get all sessions for a user
router.get('/', async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const { userId } = req.query;
      const filter = userId ? { userId } : {};
      
      const sessions = await Session.find(filter)
        .populate('userId', 'name email')
        .populate('interviewId', 'title category')
        .sort({ createdAt: -1 });
      
      res.json(sessions);
    } else {
      const { userId } = req.query;
      const sessions = userId
        ? inMemorySessions.filter(s => s.userId === userId)
        : inMemorySessions;
      res.json(sessions);
    }
  } catch (error) {
    res.status(500).json({ message: 'Error fetching sessions', error: error.message });
  }
});

// PUT /api/sessions/:id/share - Mark session as shared / generate share report
router.put('/:id/share', async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const session = await Session.findById(req.params.id)
        .populate('userId', 'name email')
        .populate('interviewId', 'title category');
      if (!session) return res.status(404).json({ message: 'Session not found' });

      session.shared = true;
      await session.save();
      res.json({ message: 'Report shared successfully', session });
    } else {
      const session = inMemorySessions.find(s => s._id === req.params.id);
      if (!session) return res.status(404).json({ message: 'Session not found' });
      session.shared = true;
      res.json({ message: 'Report shared successfully', session });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error sharing report', error: error.message });
  }
});

// PUT /api/sessions/:id/video - Upload camera recording
router.put('/:id/video', async (req, res) => {
  try {
    const { videoUrl } = req.body;
    if (!videoUrl) return res.status(400).json({ message: 'No videoUrl provided' });

    if (mongoose.connection.readyState === 1) {
      const session = await Session.findById(req.params.id);
      if (!session) return res.status(404).json({ message: 'Session not found' });
      session.videoUrl = videoUrl;
      await session.save();
      res.json({ message: 'Video saved', session });
    } else {
      const session = inMemorySessions.find(s => s._id === req.params.id);
      if (!session) return res.status(404).json({ message: 'Session not found' });
      session.videoUrl = videoUrl;
      res.json({ message: 'Video saved', session });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error saving video', error: error.message });
  }
});

module.exports = router;
module.exports.inMemorySessions = inMemorySessions;

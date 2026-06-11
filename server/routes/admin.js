const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const Session = require('../models/Session');
const Interview = require('../models/Interview');

// GET /api/admin/stats - Aggregate analytics
router.get('/stats', async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const [totalUsers, totalSessions, totalInterviews, completedSessions, scoredSessions] = await Promise.all([
        User.countDocuments(),
        Session.countDocuments(),
        Interview.countDocuments(),
        Session.countDocuments({ status: 'completed' }),
        Session.find({ score: { $ne: null } }).select('score')
      ]);

      const avgScore = scoredSessions.length > 0
        ? (scoredSessions.reduce((a, s) => a + s.score, 0) / scoredSessions.length).toFixed(1)
        : '0';

      const sharedCount = await Session.countDocuments({ shared: true });

      // Per-interview stats
      const interviewStats = await Session.aggregate([
        { $group: { _id: '$interviewId', count: { $sum: 1 }, avgScore: { $avg: '$score' } } },
        { $lookup: { from: 'interviews', localField: '_id', foreignField: '_id', as: 'interview' } },
        { $unwind: { path: '$interview', preserveNullAndEmptyArrays: true } },
        { $project: { title: '$interview.title', category: '$interview.category', sessions: '$count', avgScore: { $round: ['$avgScore', 1] } } }
      ]);

      // Daily activity (last 7 days)
      const dailyActivity = await Session.aggregate([
        { $match: { createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } } } },
        { $sort: { _id: 1 } }
      ]);

      res.json({
        totalUsers,
        totalSessions,
        totalInterviews,
        completedSessions,
        avgScore,
        sharedCount,
        completionRate: totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0,
        interviewStats,
        dailyActivity
      });
    } else {
      // In-memory fallback stats
      const { inMemoryUsers, inMemorySessions, inMemoryInterviews } = getInMemoryData();
      const completed = inMemorySessions.filter(s => s.status === 'completed');
      const scored = inMemorySessions.filter(s => s.score != null);
      const avgScore = scored.length > 0 ? (scored.reduce((a, s) => a + s.score, 0) / scored.length).toFixed(1) : '0';

      res.json({
        totalUsers: inMemoryUsers.length,
        totalSessions: inMemorySessions.length,
        totalInterviews: inMemoryInterviews.length,
        completedSessions: completed.length,
        avgScore,
        sharedCount: inMemorySessions.filter(s => s.shared).length,
        completionRate: inMemorySessions.length > 0 ? Math.round((completed.length / inMemorySessions.length) * 100) : 0,
        interviewStats: [],
        dailyActivity: []
      });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error fetching stats', error: error.message });
  }
});

// Lazy access to in-memory data (avoid circular deps)
function getInMemoryData() {
  const users = require('./users').inMemoryUsers || [];
  const sessions = require('./sessions').inMemorySessions || [];
  const interviews = require('./interviews').inMemoryInterviews || [];
  return { inMemoryUsers: users, inMemorySessions: sessions, inMemoryInterviews: interviews };
}

module.exports = router;

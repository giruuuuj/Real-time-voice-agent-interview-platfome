const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  interviewId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Interview',
    required: true
  },
  transcript: [{
    role: {
      type: String,
      enum: ['interviewer', 'candidate'],
      required: true
    },
    text: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    audioUrl: {
      type: String,
      default: null
    }
  }],
  feedback: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  score: {
    type: Number,
    min: 0,
    max: 10,
    default: null
  },
  status: {
    type: String,
    enum: ['in_progress', 'completed'],
    default: 'in_progress'
  },
  shared: {
    type: Boolean,
    default: false
  },
  videoUrl: {
    type: String,
    default: null
  },
  resumeData: {
    fileName: { type: String, default: null },
    rawText: { type: String, default: null },
    skills: { type: [String], default: [] },
    experience: { type: String, default: null },
    education: { type: String, default: null },
    projects: { type: String, default: null },
    summary: { type: String, default: null }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Session', sessionSchema);

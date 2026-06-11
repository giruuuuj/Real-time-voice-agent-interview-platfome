const express = require('express');
const multer = require('multer');
const router = express.Router();
const { extractText } = require('../utils/resumeParser');
const { getModel, analyzeResumeWithAI } = require('./ai');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, DOCX, and TXT files are allowed.'));
    }
  }
});

router.post('/analyze', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }

    const rawText = await extractText(req.file);

    if (!rawText || rawText.trim().length < 50) {
      return res.status(400).json({ success: false, message: 'Resume text too short or unreadable. Please upload a valid resume.' });
    }

    const aiResult = await analyzeResumeWithAI(rawText);

    res.json({
      success: true,
      fileName: req.file.originalname,
      rawText: rawText.substring(0, 3000),
      resumeData: aiResult
    });
  } catch (err) {
    console.error('Resume analysis error:', err.message);
    res.status(500).json({ success: false, message: err.message || 'Failed to analyze resume.' });
  }
});

module.exports = router;

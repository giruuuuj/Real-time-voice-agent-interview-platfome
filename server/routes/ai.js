const express = require('express');
const router = express.Router();
const OpenAI = require('openai');

// ─── Multi-Model AI Gateway ───
const BASE_URL = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';

// Clean text to remove any image/file references that AI models may reject
function cleanInput(text) {
  return text
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/<img[^>]*>/gi, '')
    .replace(/data:image\/[a-z]+;base64,[^\s]+/gi, '')
    .replace(/\[image:[^\]]*\]/gi, '')
    .replace(/image\.(png|jpg|jpeg|gif|bmp|svg)/gi, 'image')
    .replace(/\bfile:\/\/\/[^\s]+/g, '')
    .trim();
}

const AI_TIMEOUT = parseInt(process.env.AI_TIMEOUT_MS) || 8000;

const models = [
  {
    id: 'deepseek',
    name: 'DeepSeek V4 Flash',
    client: process.env.DEEPSEEK_API_KEY ? new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: BASE_URL, timeout: AI_TIMEOUT, maxRetries: 1 }) : null,
    model: process.env.DEEPSEEK_MODEL || 'deepseek-ai/deepseek-v4-flash',
    icon: '🧠',
    desc: '284B MoE - Best reasoning & coding'
  },
  {
    id: 'stepfun',
    name: 'Step-3.5 Flash',
    client: process.env.STEPFUN_API_KEY ? new OpenAI({ apiKey: process.env.STEPFUN_API_KEY, baseURL: BASE_URL, timeout: AI_TIMEOUT, maxRetries: 1 }) : null,
    model: process.env.STEPFUN_MODEL || 'stepfun-ai/step-3.5-flash',
    icon: '⚡',
    desc: '200B MoE - Frontier agentic AI'
  },
  {
    id: 'nvidia',
    name: 'NVIDIA Nemotron',
    client: process.env.NVIDIA_API_KEY ? new OpenAI({ apiKey: process.env.NVIDIA_API_KEY, baseURL: BASE_URL, timeout: AI_TIMEOUT, maxRetries: 1 }) : null,
    model: process.env.NVIDIA_MODEL || 'google/gemma-3n-e4b-it',
    icon: '🔷',
    desc: 'Fast general purpose'
  }
];

// Gemini fallback
let geminiModel = null;
if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here') {
  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  } catch (e) { geminiModel = null; }
}

// Log loaded models
const availableModels = models.filter(m => m.client);
console.log(`🎯 AI Gateway ready - ${availableModels.length} model(s): ${availableModels.map(m => m.name).join(', ')}${geminiModel ? ' + Gemini fallback' : ''}`);

// ─── Category-specific fallback questions ───
const fallbackByCategory = {
  tech: [
    "Hello! Welcome to your technical interview. Let's start — tell me about yourself and your technical background.",
    'What programming languages and frameworks are you most comfortable with?',
    'Can you describe a challenging technical problem you solved recently?',
    'How do you approach debugging a complex issue in your code?',
    'What is your experience with version control systems like Git?',
    'How do you stay updated with the latest technology trends?',
    'Describe your experience working with databases and data modeling.',
    'What testing strategies do you use in your projects?',
    'How do you handle code reviews and feedback from teammates?',
    'Where do you see yourself growing technically in the next few years?'
  ],
  HR: [
    "Hello! Welcome to your interview. Let's begin — tell me a bit about yourself.",
    'What motivates you in your career?',
    'Can you describe a time when you handled a difficult situation at work?',
    'What are your greatest professional strengths?',
    'How do you handle conflicts with coworkers or team members?',
    'Where do you see yourself in 5 years?',
    'Tell me about a time you demonstrated leadership.',
    'What is your preferred work style — independent or collaborative?',
    'How do you manage stress and tight deadlines?',
    'Why are you interested in this position?'
  ],
  coding: [
    "Hello! Welcome to your coding interview. Let's start — what is the difference between let, const, and var in JavaScript?",
    'Can you explain what a closure is and give an example?',
    'How would you reverse a string without using built-in methods?',
    'What is the difference between == and === in JavaScript?',
    'Explain the concept of Big O notation in simple terms.',
    'How would you find the second largest number in an array?',
    'What is a linked list and how is it different from an array?',
    'Can you explain recursion with a real-world analogy?',
    'What is the difference between a stack and a queue?',
    'How would you check if a string is a palindrome?'
  ]
};

const genericFallback = fallbackByCategory.tech;


const MAX_QUESTIONS = 10;

// ─── Helper: Get model by preference ───
function getModel(preference) {
  if (preference) {
    const found = models.find(m => m.id === preference && m.client);
    if (found) return found;
  }
  const defaultPref = process.env.DEFAULT_AI_MODEL;
  if (defaultPref) {
    const found = models.find(m => m.id === defaultPref && m.client);
    if (found) return found;
  }
  return models.find(m => m.client) || null;
}

// ─── Interview Phase Progression ───
const interviewPhases = [
  { range: [0, 0], name: 'Introduction', desc: 'Warm-up and self-introduction' },
  { range: [1, 2], name: 'Technical Skills', desc: 'Core technical competencies' },
  { range: [3, 4], name: 'Experience Deep-Dive', desc: 'Past projects and work experience' },
  { range: [5, 6], name: 'Problem Solving', desc: 'Scenario-based and analytical questions' },
  { range: [7, 8], name: 'Behavioral', desc: 'Teamwork, leadership, and culture fit' },
  { range: [9, 9], name: 'Closing', desc: 'Final thoughts and wrap-up' }
];

function getInterviewPhase(questionIndex) {
  for (const phase of interviewPhases) {
    if (questionIndex >= phase.range[0] && questionIndex <= phase.range[1]) {
      return phase;
    }
  }
  return interviewPhases[interviewPhases.length - 1];
}

// ─── Generate Question ───
async function generateQuestion(preferredModelId, category, context, questionIndex, resumeData) {
  const phase = getInterviewPhase(questionIndex);

  let systemPrompt = `You are a professional ${category} interviewer conducting a structured voice interview.
Ask ONE clear, concise question at a time. Keep questions short — easy to understand when spoken aloud.
Based on the candidate's answers, ask relevant follow-up questions.
Never add prefixes like "Question:" — just ask directly.`;

  // Add resume context if available
  if (resumeData && resumeData.skills?.length > 0) {
    systemPrompt += `\n\nCANDIDATE RESUME BACKGROUND:\nSkills: ${resumeData.skills.join(', ')}\nExperience: ${cleanInput(resumeData.experience || 'N/A')}\nEducation: ${cleanInput(resumeData.education || 'N/A')}\nProjects: ${cleanInput(resumeData.projects || 'N/A')}\nSummary: ${cleanInput(resumeData.summary || 'N/A')}`;
  }

  // Phase-specific instructions
  let userPrompt;
  if (questionIndex === 0) {
    userPrompt = resumeData
      ? `PHASE: Introduction. Greet the candidate warmly. Reference their background briefly (${cleanInput(resumeData.summary?.substring(0, 100) || 'their experience')}). Ask them to introduce themselves and talk about their career journey. Output only the question.`
      : `PHASE: Introduction. Greet warmly and ask the candidate to introduce themselves. Output only the question.`;
  } else if (phase.name === 'Technical Skills') {
    userPrompt = resumeData
      ? `PHASE: Technical Skills Assessment (question ${questionIndex + 1}). Ask about their proficiency with specific technologies from their resume (${resumeData.skills?.slice(0, 4).join(', ')}). Focus on depth of knowledge. Output only the question.`
      : `PHASE: Technical Skills Assessment (question ${questionIndex + 1}). Ask about core technical skills relevant to ${category}. Output only the question.`;
  } else if (phase.name === 'Experience Deep-Dive') {
    userPrompt = resumeData
      ? `PHASE: Experience Deep-Dive (question ${questionIndex + 1}). Ask about specific projects or work experience from their resume. Probe for details about their role, challenges, and outcomes. Output only the question.`
      : `PHASE: Experience Deep-Dive (question ${questionIndex + 1}). Ask about past work experience and specific projects. Output only the question.`;
  } else if (phase.name === 'Problem Solving') {
    userPrompt = `PHASE: Problem Solving (question ${questionIndex + 1}). Present a scenario or technical challenge. Ask how they would approach it. Focus on their thinking process. Output only the question.`;
  } else if (phase.name === 'Behavioral') {
    userPrompt = `PHASE: Behavioral (question ${questionIndex + 1}). Ask about teamwork, conflict resolution, leadership, or handling difficult situations. Output only the question.`;
  } else if (phase.name === 'Closing') {
    userPrompt = `PHASE: Closing (question ${questionIndex + 1}). Ask about their career goals, why they're interested in this role, or if they have questions. Wrap up positively. Output only the question.`;
  } else {
    userPrompt = `Previous conversation:\n${cleanInput(context)}\n\nAsk a relevant follow-up question based on their last answer. Output only the question.`;
  }

  // Collect candidate models (preferred first)
  const candidateModels = [];
  if (preferredModelId) {
    const found = models.find(m => m.id === preferredModelId && m.client);
    if (found) candidateModels.push(found);
  }
  for (const m of models) {
    if (m.client && !candidateModels.includes(m)) candidateModels.push(m);
  }
  // Add Gemini
  if (geminiModel) candidateModels.push({ id: 'gemini', name: 'Gemini', client: null, isGemini: true });

  if (candidateModels.length === 0) return null;

  // Race all models — first successful response wins
  const firstResult = await firstSuccess(
    candidateModels.map(m => tryModel(m, systemPrompt, userPrompt))
  );

  return firstResult || null;
}

// Returns first fulfilled promise with a truthy value
function firstSuccess(promises) {
  return new Promise((resolve) => {
    let settled = 0;
    if (promises.length === 0) return resolve(null);
    for (const p of promises) {
      p.then(r => { if (r) resolve(r); else { settled++; if (settled === promises.length) resolve(null); } })
       .catch(() => { settled++; if (settled === promises.length) resolve(null); });
    }
  });
}

async function tryModel(m, systemPrompt, userPrompt) {
  try {
    if (m.isGemini) {
      const result = await m.client.generateContent(`${systemPrompt}\n\n${userPrompt}`);
      const text = (await result.response).text().trim();
      if (text) return { question: text, modelUsed: m.name };
      return null;
    }
    const completion = await m.client.chat.completions.create({
      model: m.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 200,
      temperature: 0.7,
      top_p: 0.9
    });
    const text = completion.choices[0].message.content.trim();
    if (text) return { question: text, modelUsed: m.name };
    return null;
  } catch (e) {
    return null;
  }
}

// ─── Analyze Resume with AI ───
async function analyzeResumeWithAI(rawText) {
  const prompt = `You are an expert resume analyzer. Analyze this resume and extract key information. Return ONLY valid JSON with this exact structure:
{
  "skills": ["skill1", "skill2", "skill3"],
  "experience": "Brief summary of work experience (2-3 sentences)",
  "education": "Education details (degree, institution)",
  "projects": "Brief summary of key projects (2-3 sentences)",
  "summary": "Professional summary of the candidate (2-3 sentences)"
}

Resume text:
${cleanInput(rawText).substring(0, 5000)}`;

  const orderedModels = [...models];

  for (const m of orderedModels) {
    if (!m.client) continue;
    try {
      const completion = await m.client.chat.completions.create({
        model: m.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 800,
        temperature: 0.3,
        top_p: 0.8
      });
      const text = completion.choices[0].message.content.trim();
      try {
        const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').replace(/`/g, '').trim();
        const parsed = JSON.parse(cleaned);
        if (parsed.skills && Array.isArray(parsed.skills)) {
          return {
            skills: parsed.skills,
            experience: parsed.experience || '',
            education: parsed.education || '',
            projects: parsed.projects || '',
            summary: parsed.summary || ''
          };
        }
      } catch (parseErr) {
        console.log(`Resume parse error for ${m.name}: ${parseErr.message}`);
      }
    } catch (e) {
      console.log(`${m.name} resume analysis: ${e.message?.substring(0, 60)}`);
    }
  }

  if (geminiModel) {
    try {
      const result = await geminiModel.generateContent(prompt);
      const text = (await result.response).text().trim();
      try {
        const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').replace(/`/g, '').trim();
        const parsed = JSON.parse(cleaned);
        if (parsed.skills && Array.isArray(parsed.skills)) {
          return {
            skills: parsed.skills,
            experience: parsed.experience || '',
            education: parsed.education || '',
            projects: parsed.projects || '',
            summary: parsed.summary || ''
          };
        }
      } catch (e) {}
    } catch (e) { console.log(`Gemini resume analysis: ${e.message?.substring(0, 60)}`); }
  }

  // Fallback: extract basic info from raw text
  const lines = rawText.split('\n').filter(l => l.trim());
  return {
    skills: [],
    experience: lines.slice(0, 3).join(' '),
    education: '',
    projects: '',
    summary: lines.slice(0, 2).join(' ')
  };
}

// ─── Generate Feedback ───
async function generateFeedback(preferredModelId, category, fullTranscript) {
  const prompt = `You are an expert ${category} interviewer. Evaluate this interview and provide detailed feedback.

Transcript:
${cleanInput(fullTranscript)}

Return ONLY valid JSON (no markdown, no code blocks):
{
  "score": <number 1-10>,
  "strengths": "<detailed strengths>",
  "weaknesses": "<areas for improvement>",
  "overallAssessment": "<detailed overall assessment>"
}`;

  // Build ordered list: preferred first
  const orderedModels = [...models];
  if (preferredModelId) {
    const idx = orderedModels.findIndex(m => m.id === preferredModelId && m.client);
    if (idx > 0) {
      const [pref] = orderedModels.splice(idx, 1);
      orderedModels.unshift(pref);
    }
  }

  for (const m of orderedModels) {
    if (!m.client) continue;
    try {
      const completion = await m.client.chat.completions.create({
        model: m.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1200,
        temperature: 0.3,
        top_p: 0.8
      });
      const text = completion.choices[0].message.content.trim();
      try {
        const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').replace(/`/g, '').trim();
        const fb = JSON.parse(cleaned);
        if (fb.score) return { feedback: fb, modelUsed: m.name };
      } catch (parseErr) {
        // Try to extract score from text
        const scoreMatch = text.match(/score.*?(\d+)/i);
        return {
          feedback: {
            score: scoreMatch ? parseInt(scoreMatch[1]) : 7,
            strengths: 'See detailed feedback below.',
            weaknesses: 'See detailed feedback below.',
            overallAssessment: text
          },
          modelUsed: m.name
        };
      }
    } catch (e) {
      console.log(`  ${m.name} feedback: ${e.message?.substring(0, 60)}`);
    }
  }

  if (geminiModel) {
    try {
      const result = await geminiModel.generateContent(prompt);
      const text = (await result.response).text().trim();
      try {
        const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').replace(/`/g, '').trim();
        const fb = JSON.parse(cleaned);
        if (fb.score) return { feedback: fb, modelUsed: 'Gemini' };
      } catch (e) {}
    } catch (e) { console.log(`  Gemini feedback: ${e.message?.substring(0, 60)}`); }
  }

  return null;
}

// ─── GET /api/ai/models - List available models ───
router.get('/models', (req, res) => {
  res.json({
    available: models.map(m => ({
      id: m.id,
      name: m.name,
      icon: m.icon,
      desc: m.desc,
      connected: !!m.client,
      model: m.model
    })),
    gemini_available: !!geminiModel,
    default_model: process.env.DEFAULT_AI_MODEL || 'deepseek'
  });
});

// ─── POST /api/ai/next-question ───
router.post('/next-question', async (req, res) => {
  try {
    const { transcript, interviewCategory, currentQuestionIndex, model, resumeData } = req.body;
    const idx = currentQuestionIndex || 0;
    
    if (idx >= MAX_QUESTIONS) {
      return res.json({ question: null, done: true, message: `Interview complete! ${MAX_QUESTIONS} questions answered.` });
    }
    
    const category = interviewCategory || 'tech';
    const context = (transcript && transcript.length > 0)
      ? transcript.map(t => `${t.role === 'interviewer' ? 'Interviewer' : 'Candidate'}: ${t.text}`).join('\n')
      : 'No previous conversation.';

    const result = await generateQuestion(model || null, category, context, idx, resumeData || null);
    if (result) return res.json({ question: result.question, modelUsed: result.modelUsed, done: false });

    const questions = fallbackByCategory[category] || genericFallback;
    res.json({ question: questions[idx % questions.length], modelUsed: 'Built-in', done: false });
  } catch (error) {
    res.json({ question: 'Next question...', done: false });
  }
});


// ─── POST /api/ai/feedback ───
router.post('/feedback', async (req, res) => {
  try {
    const { transcript, interviewCategory, model } = req.body;
    const category = interviewCategory || 'tech';
    const candidateAnswers = (transcript || []).filter(t => t.role === 'candidate');
    const questionCount = candidateAnswers.length;

    const fullTranscript = (transcript || []).map(t =>
      `${t.role === 'interviewer' ? 'Interviewer' : 'Candidate'}: ${t.text}`
    ).join('\n');

    const result = await generateFeedback(model || null, category, fullTranscript);

    if (result && result.feedback && result.feedback.score) {
      return res.json({
        feedback: result.feedback,
        score: result.feedback.score,
        modelUsed: result.modelUsed
      });
    }

    // Smart fallback
    const avgLen = questionCount > 0
      ? candidateAnswers.reduce((s, a) => s + a.text.split(' ').length, 0) / questionCount : 0;
    let score = 5;
    if (avgLen > 30) score = 6;
    if (avgLen > 60) score = 7;
    if (avgLen > 100) score = 8;
    score = Math.min(9, score + Math.min(questionCount, 2));

    let strengths = 'Participated and engaged with interview questions.';
    let weaknesses = 'Could provide more detailed, specific examples.';
    let overall = `Answered ${questionCount} questions. `;

    if (avgLen > 60) {
      strengths = 'Excellent communication with detailed, thoughtful responses. Well-structured answers demonstrating expertise.';
      overall += 'Responses were comprehensive and demonstrated strong communication ability.';
    } else if (avgLen > 30) {
      overall += 'Responses were adequate. More specific examples would strengthen answers significantly.';
    } else {
      weaknesses = 'Responses were brief. Elaborate with specific examples and deeper explanations for greater impact.';
      overall += 'Responses were short. Try providing more context and concrete examples.';
    }

    res.json({
      feedback: { score, strengths, weaknesses, overallAssessment: overall },
      score,
      modelUsed: 'Built-in'
    });
  } catch (error) {
    const count = (req.body?.transcript || []).filter(t => t.role === 'candidate').length;
    res.json({
      feedback: {
        score: Math.min(8, 5 + Math.floor(count / 2)),
        strengths: 'Good effort in answering the interview questions.',
        weaknesses: 'Could provide more specific examples and detailed explanations.',
        overallAssessment: `Candidate attempted ${count} questions.`
      },
      score: Math.min(8, 5 + Math.floor(count / 2)),
      modelUsed: 'Built-in (error)'
    });
  }
});

// ─── POST /api/ai/tts - Grok Voice TTS 1.0 via OpenRouter ───
router.post('/tts', async (req, res) => {
  try {
    const { text } = req.body;
    const voice = 'Eve'; // Hardcoded consistent voice (female/loud profile)
    if (!text) return res.status(400).json({ message: 'No text provided' });

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.json({ fallback: true, text });
    }

    const client = new OpenAI({
      apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'http://localhost:5173',
        'X-OpenRouter-Title': 'Real-Time Voice Interview Platform'
      }
    });

    console.log(`[Grok TTS] Using hardcoded voice: ${voice} for text length ${text.length}`);

    try {
      const response = await client.audio.speech.create({
        model: 'x-ai/grok-voice-tts-1.0',
        input: text,
        voice,
        response_format: 'mp3'
      });

      const buffer = Buffer.from(await response.arrayBuffer());
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Length', buffer.length);
      res.send(buffer);
    } catch (ttsErr) {
      console.error('Grok Voice TTS error:', ttsErr.message || ttsErr);
      res.json({ fallback: true, text });
    }
  } catch (error) {
    res.json({ fallback: true, text: req.body.text });
  }
});

module.exports = router;
module.exports.getModel = getModel;
module.exports.analyzeResumeWithAI = analyzeResumeWithAI;

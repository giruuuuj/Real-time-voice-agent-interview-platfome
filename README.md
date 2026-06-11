# Real-Time Voice Agent Interview Platform
https://drive.google.com/file/d/1ca3IHXlgC2T206czeJHmAwdJE1-ybhpC/view?usp=drive_link

A complete voice-powered interview platform using React, Node.js, MongoDB, and AI services.

## Features

- User registration and authentication
- Multiple interview types (Tech, HR, Coding)
- Real-time voice recording
- AI-powered interviewer (OpenAI)
- AI-generated feedback and scoring
- Complete transcript storage
- Beautiful, responsive UI

## Tech Stack

### Frontend
- React (Vite)
- Axios (API calls)
- Browser SpeechSynthesis API (Text-to-Speech)
- MediaRecorder API (Voice recording)

### Backend
- Node.js
- Express
- MongoDB (Mongoose)
- OpenAI API (AI interviewer)
- Deepgram (Speech-to-Text) - To be integrated

## Prerequisites

- Node.js (v16 or higher)
- MongoDB (local or MongoDB Atlas)
- OpenAI API key
- Deepgram API key (optional, for speech-to-text)

## Setup Instructions

### 1. Clone and Install

```bash
# Navigate to project directory
cd "e:\Real-Time voice Agent Interview platfrom"

# Install backend dependencies
cd server
npm install

# Install frontend dependencies
cd ../client
npm install
```

### 2. Environment Variables

Create a `.env` file in the root directory:

```env
# MongoDB Connection
MONGODB_URI=mongodb://localhost:27017/voice-interview

# Deepgram API Key (get from https://console.deepgram.com/)
DEEPGRAM_API_KEY=your_deepgram_api_key_here

# OpenAI API Key (get from https://platform.openai.com/)
OPENAI_API_KEY=your_openai_api_key_here

# OpenRouter API Key for Grok Voice TTS (https://openrouter.ai/keys)
OPENROUTER_API_KEY=your_openrouter_api_key_here

# Server Port
PORT=5000
```

The frontend `.env` file is already created at `client/.env`:
```env
VITE_API_URL=http://localhost:5000
```

### 3. Seed Sample Interviews

```bash
cd server
node seed.js
```

This will add sample interview templates to your database.

### 4. Start the Backend

```bash
cd server
npm run dev
```

The backend will run on `http://localhost:5000`

### 5. Start the Frontend

```bash
cd client
npm run dev
```

The frontend will run on `http://localhost:5173`

## Usage

1. Open `http://localhost:5173` in your browser
2. Register with your name and email
3. Select an interview from the dashboard
4. Click "Start Interview"
5. The AI will ask questions (audio will play)
6. Click "Record Answer" to respond
7. After answering, the AI will ask the next question
8. Click "End Interview" when done
9. View your score and feedback

## API Endpoints

### Users
- `POST /api/users/register` - Create new user
- `GET /api/users/:id` - Get user profile

### Interviews
- `POST /api/interviews` - Create interview template
- `GET /api/interviews` - List all interviews
- `GET /api/interviews/:id` - Get specific interview

### Sessions
- `POST /api/sessions` - Start new interview session
- `PUT /api/sessions/:id/transcript` - Add Q&A to transcript
- `PUT /api/sessions/:id/feedback` - Save AI feedback
- `GET /api/sessions/:id` - Get session details

### AI
- `POST /api/ai/next-question` - Get next question from AI
- `POST /api/ai/feedback` - Generate feedback on transcript

## Project Structure

```
voice-interview-platform/
├── client/                 # React frontend
│   ├── src/
│   │   ├── App.jsx        # Main application
│   │   └── App.css        # Styles
│   └── .env               # Frontend env variables
├── server/                # Node.js backend
│   ├── index.js           # Server entry point
│   ├── routes/            # API routes
│   │   ├── users.js
│   │   ├── interviews.js
│   │   ├── sessions.js
│   │   └── ai.js
│   ├── package.json
│   └── seed.js            # Database seed script
├── models/                # MongoDB schemas
│   ├── User.js
│   ├── Interview.js
│   └── Session.js
├── .env                   # Backend env variables
└── README.md
```

## Next Steps for Full Implementation

1. **Deepgram Integration**: Replace placeholder text in voice recording with actual Deepgram speech-to-text
2. **User Authentication**: Add proper authentication with JWT
3. **Interview Creation UI**: Add UI for users to create custom interviews
4. **Past Sessions**: Add dashboard to view past interview history
5. **Download Report**: Add feature to download interview results as PDF
6. **Deployment**: Deploy to Vercel (frontend) and Render/Railway (backend)

## Troubleshooting

### MongoDB Connection Error
- Ensure MongoDB is running locally or update MONGODB_URI with Atlas connection string
- Check if MongoDB service is running: `mongod` (for local)

### OpenAI API Error
- Verify your OPENAI_API_KEY is correct in .env
- Ensure you have credits in your OpenAI account

### Microphone Access Denied
- Ensure browser has permission to access microphone
- Check browser settings for microphone permissions

## License

MIT

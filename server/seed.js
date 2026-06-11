require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Interview = require('./models/Interview');
const User = require('./models/User');

const sampleInterviews = [
  {
    title: 'Frontend Developer Interview',
    category: 'tech',
    questions: [
      'Tell me about your experience with React',
      'Explain the difference between state and props',
      'What is the virtual DOM?',
      'How do you handle state management in React?'
    ]
  },
  {
    title: 'Backend Developer Interview',
    category: 'tech',
    questions: [
      'Explain RESTful API design principles',
      'What is Node.js event loop?',
      'How do you handle authentication in APIs?',
      'Describe database indexing'
    ]
  },
  {
    title: 'HR General Interview',
    category: 'HR',
    questions: [
      'Tell me about yourself',
      'What are your strengths and weaknesses?',
      'Why do you want to work here?',
      'Where do you see yourself in 5 years?'
    ]
  },
  {
    title: 'JavaScript Coding Interview',
    category: 'coding',
    questions: [
      'Write a function to reverse a string',
      'Explain closures in JavaScript',
      'What is the difference between == and ===?',
      'Implement a debounce function'
    ]
  }
];

async function seedDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/voice-interview');
    console.log('Connected to MongoDB');

    // Clear existing data
    await Interview.deleteMany({});
    await User.deleteMany({});
    console.log('Cleared existing data');

    // Create admin user
    const adminUser = new User({
      name: 'Admin',
      email: 'admin@example.com',
      password: 'admin123',
      role: 'admin'
    });
    await adminUser.save();
    console.log('Created admin user: admin@example.com / admin123');

    // Create sample user
    const demoUser = new User({
      name: 'Demo User',
      email: 'demo@example.com',
      password: 'demo123',
      role: 'user'
    });
    await demoUser.save();
    console.log('Created demo user: demo@example.com / demo123');

    // Insert sample interviews
    const interviewsWithUser = sampleInterviews.map(interview => ({
      ...interview,
      createdBy: adminUser._id
    }));
    await Interview.insertMany(interviewsWithUser);
    console.log('Sample interviews inserted');

    console.log('\nSample Data:');
    console.log('Login: admin@example.com / admin123 (admin)');
    console.log('Login: demo@example.com / demo123 (user)');
    sampleInterviews.forEach((i, idx) => {
      console.log(`  ${idx + 1}. ${i.title} (${i.category})`);
    });

    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
}

seedDatabase();

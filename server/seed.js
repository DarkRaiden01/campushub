const mongoose = require('mongoose');
const User = require('./models/User');
const SkillPost = require('./models/SkillPost');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/skill-swap';

async function seed(){
  await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to MongoDB for seeding');

  await User.deleteMany({});
  await SkillPost.deleteMany({});

  const users = await User.create([
    { name: 'Alice Johnson', email: 'alice@example.com', skillPoints: 120 },
    { name: 'Brian Lee', email: 'brian@example.com', skillPoints: 95 },
    { name: 'Carla Gomez', email: 'carla@example.com', skillPoints: 60 },
    { name: 'David Park', email: 'david@example.com', skillPoints: 30 }
  ]);

  const posts = [
    { skillName: 'Calculus Tutoring', category: 'Academic', type: 'Offering', user: users[0]._id },
    { skillName: 'Guitar Basics', category: 'Creative', type: 'Offering', user: users[1]._id },
    { skillName: 'Intro to Python', category: 'Tech', type: 'Offering', user: users[2]._id },
    { skillName: 'Essay Writing Help', category: 'Academic', type: 'Requesting', user: users[3]._id }
  ];

  await SkillPost.create(posts);

  console.log('Seed complete. Created users and skill posts.');
  mongoose.disconnect();
}

seed().catch(err => { console.error('Seed error:', err); mongoose.disconnect(); process.exit(1); });

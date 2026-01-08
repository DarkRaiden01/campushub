const mongoose = require('mongoose');

const SkillPostSchema = new mongoose.Schema({
  skillName: { type: String, required: true },
  category: { type: String, enum: ['Academic','Creative','Tech'], required: true },
  type: { type: String, enum: ['Offering','Requesting'], required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('SkillPost', SkillPostSchema);

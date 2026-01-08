const express = require('express');
const router = express.Router();
const SkillPost = require('../models/SkillPost');
const User = require('../models/User');

// GET /api/bazaar/posts?type=Offering|Requesting
router.get('/posts', async (req, res) => {
  try {
    const type = req.query.type; // optional
    const filter = {};
    if (type) filter.type = type;

    let posts = await SkillPost.find(filter).populate('user').lean();

    // sort by user.skillPoints desc (leaderboard style)
    posts.sort((a,b) => {
      const ap = (a.user && a.user.skillPoints) || 0;
      const bp = (b.user && b.user.skillPoints) || 0;
      return bp - ap;
    });

    res.json({ success: true, data: posts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Convenience route for offerings
router.get('/offerings', async (req, res) => {
  try {
    let posts = await SkillPost.find({ type: 'Offering' }).populate('user').lean();
    posts.sort((a,b) => ((b.user && b.user.skillPoints) || 0) - ((a.user && a.user.skillPoints) || 0));
    res.json({ success: true, data: posts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/bazaar/posts - create a new skill post
router.post('/posts', async (req, res) => {
  try {
    const { skillName, category, type, userId } = req.body;
    if (!skillName || !category || !type || !userId) return res.status(400).json({ success: false, error: 'Missing fields' });

    // verify user exists
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const post = await SkillPost.create({ skillName, category, type, user: user._id });
    const populated = await SkillPost.findById(post._id).populate('user').lean();
    res.json({ success: true, data: populated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/bazaar/complete - { tutorId }
// Adds +10 skillPoints to tutor
router.post('/complete', async (req, res) => {
  try {
    const { tutorId } = req.body;
    if (!tutorId) return res.status(400).json({ success: false, error: 'tutorId required' });

    const tutor = await User.findById(tutorId);
    if (!tutor) return res.status(404).json({ success: false, error: 'Tutor not found' });

    tutor.skillPoints = (tutor.skillPoints || 0) + 10;
    await tutor.save();

    res.json({ success: true, tutor });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/bazaar/request/:postId - send a message to the tutor (placeholder)
router.post('/request/:postId', async (req, res) => {
  try {
    const { postId } = req.params;
    const { message, fromName } = req.body;
    const post = await SkillPost.findById(postId).populate('user');
    if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

    // In real app: send notification/email; here we just return the payload
    return res.json({ success: true, to: post.user, message: { fromName, message } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

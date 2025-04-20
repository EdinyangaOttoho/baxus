const express = require('express');
const router = express.Router();
const recommendationController = require('../controllers/recommendationController');

// GET recommendations for a user
router.get('/recommendations/user/:username', recommendationController.getUserRecommendations);

module.exports = router;
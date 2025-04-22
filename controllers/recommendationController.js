const apiService = require('../services/apiService');
const hybridService = require('../services/recommendation/hybridService');
const logger = require('../utils/logger');
const config = require('../config/config');

class RecommendationController {
  async getUserRecommendations(req, res, next) {
    try {
      const { username } = req.params;
      
      let userBar = [];
      try {
        userBar = await apiService.getUserBar(username);
      } catch (error) {
        logger.warn(`Failed to fetch user bar for ${username}, using cold start: ${error.message}`);
      }
      
      const recommendations = await hybridService.getRecommendations(
        userBar.whiskies,
        config.recommendation.maxRecommendations,
        userBar.whisky_ids
      );
      
      if (recommendations?.length === 0) {
        return res.status(404).json({ 
          error: 'No recommendations available',
          suggestions: [
            'Try broadening your search criteria',
            'Our sommelier is working on new suggestions'
          ]
        });
      }
      
      res.json({
        username,
        hasExistingCollection: userBar.whiskies?.length > 0,
        count: recommendations?.length,
        recommendations: recommendations.map(rec => ({
          id: rec.id,
          name: rec.name,
          brand: rec.brand,
          spiritType: rec.spiritType,
          proof: rec.proof,
          size: rec.size,
          imageUrl: rec.imageUrl || config.constants.DEFAULT_IMAGE_URL,
          avgMsrp: rec.avgMsrp,
          fairPrice: rec.fairPrice,
          shelfPrice: rec.shelfPrice,
          reason: rec.reason,
          matchScore: rec.score.toFixed(3),
          recommendationType: rec.type
        }))
      });
    } catch (error) {
      logger.error('Recommendation error:', error);
      next(error);
    }
  }
}

module.exports = new RecommendationController();
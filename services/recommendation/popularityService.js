const whiskyModel = require('../../models/whiskyModel');
const logger = require('../../utils/logger');

class PopularityService {
  async getRecommendations(limit = 10) {
    await whiskyModel.loadWhiskies();
    return whiskyModel.getPopularWhiskies(limit).map(whisky => ({
      ...whisky,
      score: 1, // Max score for popularity-based
      type: 'popularity',
      reason: `Popular choice ranked #${whisky.ranking} with ${whisky.popularity} popularity points`
    }));
  }
}

module.exports = new PopularityService();
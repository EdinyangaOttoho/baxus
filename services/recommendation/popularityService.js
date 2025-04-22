const whiskyModel = require('../../models/whiskyModel');
const logger = require('../../utils/logger');

class PopularityService {
  async getRecommendations(limit = 501, userWhiskies) {
    await whiskyModel.loadWhiskies();
    return whiskyModel.getPopularWhiskies(limit).map(whisky => ({
      ...whisky,
      score: 0.65, // Max score for popularity-based
      type: 'popularity',
      reason: `Popular choice ranked #${whisky.ranking} with ${whisky.popularity} popularity points`
    })).filter(item => !(userWhiskies.map(x=>x.product.id.toString()).includes(item.id.toString())))
  }
}

module.exports = new PopularityService();
const contentBasedService = require('./contentBasedService');
const popularityService = require('./popularityService');
const whiskyModel = require('../../models/whiskyModel');
const config = require('../../config/config');
const logger = require('../../utils/logger');

class HybridService {
  constructor() {
    this.contentBasedWeight = config.recommendation.weights.contentBased;
    this.popularityWeight = config.recommendation.weights.popularity;
    this.diversityWeight = config.recommendation.weights.diversity;
  }

  async getRecommendations(userWhiskies, limit = 5) {
    await whiskyModel.loadWhiskies();
    const allWhiskies = whiskyModel.getAllWhiskies();

    let recommendations = [];
    
    if (userWhiskies && userWhiskies.length > 0) {
      // Get content-based recommendations
      const contentBasedRecs = await contentBasedService.getRecommendations(
        userWhiskies, 
        allWhiskies, 
        limit * 2
      );
      
      // Get popular recommendations
      const popularRecs = await popularityService.getRecommendations(limit * 2);
      
      // Combine and re-rank
      recommendations = this._combineRecommendations(
        contentBasedRecs, 
        popularRecs, 
        limit
      );
    } else {
      // Cold start - use hybrid of popular and diverse
      const popularRecs = await popularityService.getRecommendations(limit);
      const diverseRecs = whiskyModel.getDiverseWhiskies(limit)
        .map(whisky => ({
          ...whisky,
          score: 1,
          type: 'diversity',
          reason: `Diverse selection representing ${whisky.spiritType} category`
        }));
      
      recommendations = this._combineRecommendations(
        popularRecs,
        diverseRecs,
        limit
      );
    }

    return recommendations;
  }

  _combineRecommendations(contentRecs, otherRecs, limit) {
    const combined = [...contentRecs, ...otherRecs];
    
    // Deduplicate
    const uniqueMap = new Map();
    combined.forEach(item => {
      if (!uniqueMap.has(item.id)) {
        uniqueMap.set(item.id, item);
      } else {
        // If duplicate, keep the one with higher score
        const existing = uniqueMap.get(item.id);
        if (item.score > existing.score) {
          uniqueMap.set(item.id, item);
        }
      }
    });
    
    // Sort by combined score
    return Array.from(uniqueMap.values())
      .sort((a, b) => {
        // Apply different weights based on recommendation type
        const aWeight = this._getTypeWeight(a.type);
        const bWeight = this._getTypeWeight(b.type);
        return (b.score * bWeight) - (a.score * aWeight);
      })
      .slice(0, limit);
  }

  _getTypeWeight(type) {
    switch (type) {
      case 'content': return this.contentBasedWeight;
      case 'popularity': return this.popularityWeight;
      case 'diversity': return this.diversityWeight;
      default: return 1;
    }
  }
}

module.exports = new HybridService();

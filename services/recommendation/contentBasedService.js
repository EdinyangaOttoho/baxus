const natural = require('natural');
const compromise = require('compromise');
const { WordNet } = natural;
const wordnet = new WordNet();
const similarity = require('../../utils/similarity');
const logger = require('../../utils/logger');
const config = require('../../config/config');

class ContentBasedService {
  constructor() {
    this.tokenizer = new natural.WordTokenizer();
    this.tfidf = new natural.TfIdf();
    this.wordnet = wordnet;
  }

  async getRecommendations(userWhiskies, allWhiskies, limit = 501) {
    if (!userWhiskies || userWhiskies.length === 0) {
      return [];
    }

    // Create a profile from user's whiskies
    const userProfile = this._createUserProfile(userWhiskies);

    // Score all candidate whiskies
    const scoredWhiskies = await Promise.all(
      allWhiskies.map(async whisky => ({
        whisky,
        score: await this._calculateScore(whisky, userProfile)
      }))
    );

    // Filter and sort
    return scoredWhiskies
      .filter(item => item.score >= config.recommendation.minSimilarityScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => ({
        ...item.whisky,
        score: item.score,
        type: 'content',
        reason: this._generateReason(item.whisky, userWhiskies)
      }));
  }

  _createUserProfile(userWhiskies) {
    const profile = {
      brands: new Set(),
      spiritTypes: new Set(),
      proofs: [],
      tastingNotes: []
    };

    userWhiskies.forEach(whisky => {
      profile.brands.add(whisky.product.brand);
      profile.spiritTypes.add(whisky.product.spirit);
      profile.proofs.push(parseFloat(whisky.product.proof) || 0);
      
      // Extract tasting notes from description (simplified)
      if (whisky.product.description) {
        const doc = compromise(whisky.product.description);
        profile.tastingNotes.push(...doc.adjectives().out('array'));
      }
    });

    return {
      brands: Array.from(profile.brands),
      spiritTypes: Array.from(profile.spiritTypes),
      avgProof: profile.proofs.reduce((a, b) => a + b, 0) / profile.proofs.length,
      tastingNotes: [...new Set(profile.tastingNotes)]
    };
  }

  async _calculateScore(whisky, userProfile) {
    const weights = config.recommendation.contentFields;
    let score = 0;

    // Brand similarity
    if (userProfile.brands.includes(whisky.brand)) {
      score += weights.brand;
    }

    // Spirit type similarity
    if (userProfile.spiritTypes.includes(whisky.spiritType)) {
      score += weights.spiritType;
    }

    // Name similarity
    const nameSimilarity = await similarity.calculateTextSimilarity(
      whisky.name, 
      userProfile.brands.join(' ') + ' ' + userProfile.spiritTypes.join(' ')
    );
    score += nameSimilarity * weights.name;

    // Proof similarity (normalized)
    const proofDiff = Math.abs(whisky.proof - userProfile.avgProof);
    const proofSimilarity = 1 - (proofDiff / 150); // Max proof difference assumed to be 150
    score += proofSimilarity * weights.proof;

    // Tasting notes similarity
    if (whisky.description) {
      const doc = compromise(whisky.description);
      const whiskyNotes = doc.adjectives().out('array');
      const notesSimilarity = similarity.calculateJaccardSimilarity(
        whiskyNotes,
        userProfile.tastingNotes
      );
      score += notesSimilarity * weights.tastingNotes;
    }

    return Math.min(1, score);
  }

  _generateReason(whisky, userWhiskies) {
    const reasons = [];
    
    // Check for brand match
    const brandMatch = userWhiskies.some(w => w.product.brand === whisky.brand);
    if (brandMatch) {
      reasons.push(`same brand (${whisky.brand}) as whiskies in your collection`);
    }
    
    // Check for spirit type match
    const typeMatch = userWhiskies.some(w => w.product.spirit === whisky.spiritType);
    if (typeMatch) {
      reasons.push(`same type (${whisky.spiritType}) as your whiskies`);
    }
    
    // Check for proof range
    const userProofs = userWhiskies.map(w => parseFloat(w.product.proof)).filter(p => !isNaN(p));
    if (userProofs.length > 0) {
      const avgProof = userProofs.reduce((a, b) => a + b, 0) / userProofs.length;
      if (Math.abs(whisky.proof - avgProof) < 10) {
        reasons.push(`similar proof (${whisky.proof}) to your collection average`);
      }
    }
    
    if (reasons.length === 0) {
      reasons.push('similar characteristics to whiskies you might enjoy');
    }
    
    return `Recommended because it's ${reasons.join(' and ')}.`;
  }
}

module.exports = new ContentBasedService();
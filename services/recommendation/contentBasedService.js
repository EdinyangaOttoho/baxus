const natural = require('natural');
const compromise = require('compromise');
const { WordNet } = natural;
const wordnet = new WordNet();
const similarity = require('../../utils/similarity');
const imageSimilarity = require('../../utils/imageSimilarity');
const config = require('../../config/config');

class ContentBasedService {

  constructor() {
    this.tokenizer = new natural.WordTokenizer();
    this.tfidf = new natural.TfIdf();
    this.wordnet = wordnet;
  }

  async getRecommendations(userWhiskies, allWhiskies, limit = 501, whiskyIds) {

    if (!userWhiskies || userWhiskies.length === 0) {
      return [];
    }

    // Create a profile from user's whiskies
    const userProfile = this._createUserProfile(userWhiskies);

    // Score all candidate whiskies
    const scoredWhiskies = await Promise.all(
      allWhiskies.map(async whisky => {
        let visualScore = 0;
        try {
          visualScore = imageSimilarity.calculateVisualSimilarity(
            whiskyIds,
            parseInt(whisky.id, 10)
          );
        }
        catch (error) {}
        return {
          whisky,
          score: await this._calculateScore(whisky, userProfile, visualScore),
          visualScore
        }
      })
    );

    // Filter and sort
    const result = scoredWhiskies
      .filter(item => item.score >= config.recommendation.minSimilarityScore)
      .filter(item => !(userWhiskies.map(x=>x.product.id.toString()).includes(item.whisky.id.toString())))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => ({
        ...item.whisky,
        score: item.score,
        type: 'content',
        reason: this._generateReason(item.whisky, userWhiskies, userProfile.priceRange, item.visualScore)
      }));

    return result;

  }

  _createUserProfile(userWhiskies) {
    const profile = {
      brands: new Set(),
      spiritTypes: new Set(),
      proofs: [],
      prices: [],
      tastingNotes: []
    };

    userWhiskies.forEach(whisky => {
      profile.brands.add(whisky.product.brand);
      profile.spiritTypes.add(whisky.product.spirit);
      profile.prices.push(parseFloat(whisky.product.shelf_price) || 0);
      profile.proofs.push(parseFloat(whisky.product.proof) || 0);
      
      // Extract tasting notes from description (simplified)
      if (whisky.product.description) {
        const doc = compromise(whisky.product.description);
        profile.tastingNotes.push(...doc.adjectives().out('array'));
      }
    });

    const min = Math.min(...profile.prices);
    const max = Math.max(...profile.prices)

    const result = {
      brands: Array.from(profile.brands),
      spiritTypes: Array.from(profile.spiritTypes),
      avgProof: profile.proofs.reduce((a, b) => a + b, 0) / profile.proofs.length,
      tastingNotes: [...new Set(profile.tastingNotes)],
      priceRange: [min, max]
    };

    return result;

  }

  async _calculateScore(whisky, userProfile, visualScore) {

    const weights = config.recommendation.contentFields;
    
    let score = 0;

    // Image similarity
    score += (visualScore * weights.visual) || 0;

    // Brand similarity
    if (userProfile.brands.includes(whisky.brand)) {
      score += weights.brand || 0;
    }

    // Price similarity

    const priceSimilarity = similarity.calculatePriceSimilarity(userProfile.priceRange, whisky.fair_price); // Call price similarity

    score += (priceSimilarity * weights.price) || 0;

    // Spirit type similarity
    if (userProfile.spiritTypes.includes(whisky.spiritType)) {
      score += weights.spiritType || 0;
    }

    // Name similarity
    const nameSimilarity = await similarity.calculateTextSimilarity(
      whisky.name, 
      userProfile.brands.join(' ') + ' ' + userProfile.spiritTypes.join(' ')
    );
    score += (nameSimilarity * weights.name) || 0;

    // Proof similarity (normalized)
    const proofDiff = Math.abs(whisky.proof - userProfile.avgProof);
    const proofSimilarity = 1 - (proofDiff / 150); // Max proof difference assumed to be 150
    score += (proofSimilarity * weights.proof) || 0;

    // Tasting notes similarity
    if (whisky.description) {
      const doc = compromise(whisky.description);
      const whiskyNotes = doc.adjectives().out('array');
      const notesSimilarity = similarity.calculateJaccardSimilarity(
        whiskyNotes,
        userProfile.tastingNotes
      );
      score += (notesSimilarity * weights.tastingNotes) || 0;
    }

    return Math.min(1, score);
  }

  _generateReason(whisky, userWhiskies, priceRange=null, visualScore) {

    const reasons = [];

    // Image similarity reason
    if (visualScore > 0.5) {
      reasons.push(`visually similar to your selections`);
    }

    // Price reason

    const [minPrice, maxPrice] = priceRange;
    
    if (whisky.fair_price >= minPrice && whisky.fair_price <= maxPrice) {
      reasons.push(`price ($${whisky.fair_price}) is around your preferred range`);
    }
    
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
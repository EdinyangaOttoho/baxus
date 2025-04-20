const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');
const NodeCache = require('node-cache');
const config = require('../config/config');
const logger = require('../utils/logger');

class WhiskyModel {
  constructor() {
    this.cache = new NodeCache(config.cache);
    this.whiskies = [];
    this.popularWhiskies = [];
    this.diverseWhiskies = [];
  }

  async loadWhiskies() {
    if (this.whiskies.length > 0) return;

    const cacheKey = 'whiskies_data';
    const cachedData = this.cache.get(cacheKey);
    
    if (cachedData) {
      this.whiskies = cachedData.whiskies;
      this.popularWhiskies = cachedData.popularWhiskies;
      this.diverseWhiskies = cachedData.diverseWhiskies;
      return;
    }

    try {
      const results = [];
      const filePath = path.join(__dirname, '../data/dataset.csv');
      
      await new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
          .pipe(csv())
          .on('data', (data) => {
            results.push(this.normalizeWhisky(data))
          })
          .on('end', () => {
            this.whiskies = results;
            this._prepareSpecializedLists();
            this.cache.set(cacheKey, {
              whiskies: this.whiskies,
              popularWhiskies: this.popularWhiskies,
              diverseWhiskies: this.diverseWhiskies
            });
            resolve();
          })
          .on('error', reject);
      });
    } catch (error) {
      logger.error('Failed to load whiskies:', error);
      throw new Error('Failed to load whisky data');
    }
  }

  normalizeWhisky(whisky) {
    return {
      id: whisky.id,
      name: whisky.name,
      size: whisky.size,
      proof: parseFloat(whisky.proof) || 0,
      abv: parseFloat(whisky.abv) || 0,
      spiritType: whisky.spirit_type,
      brandId: whisky.brand_id,
      brand: whisky.brand,
      popularity: parseInt(whisky.popularity) || 0,
      imageUrl: whisky.image_url,
      avgMsrp: parseFloat(whisky.avg_msrp) || 0,
      fairPrice: parseFloat(whisky.fair_price) || 0,
      shelfPrice: parseFloat(whisky.shelf_price) || 0,
      totalScore: parseFloat(whisky.total_score) || 0,
      ranking: parseInt(whisky.ranking) || 0,
      wishlistCount: parseInt(whisky.wishlist_count) || 0,
      voteCount: parseInt(whisky.vote_count) || 0,
      barCount: parseInt(whisky.bar_count) || 0
    };
  }

  _prepareSpecializedLists() {
    this.popularWhiskies = [...this.whiskies]
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, 100);

    const spiritTypes = [...new Set(this.whiskies.map(w => w.spiritType))];
    this.diverseWhiskies = spiritTypes.flatMap(type => {
      return [...this.whiskies]
        .filter(w => w.spiritType === type)
        .sort((a, b) => b.popularity - a.popularity)
        .slice(0, 5);
    });
  }

  getAllWhiskies() {
    return this.whiskies;
  }

  getWhiskyById(id) {
    return this.whiskies.find(w => w.id === id);
  }

  getPopularWhiskies(limit = 10) {
    return this.popularWhiskies.slice(0, limit);
  }

  getDiverseWhiskies(limit = 10) {
    return this.diverseWhiskies.slice(0, limit);
  }

  getWhiskiesBySpiritType(spiritType) {
    return this.whiskies.filter(w => 
      w.spiritType.toLowerCase() === spiritType.toLowerCase()
    );
  }

  getWhiskiesByBrand(brand) {
    return this.whiskies.filter(w => 
      w.brand.toLowerCase().includes(brand.toLowerCase())
    );
  }
}

module.exports = new WhiskyModel();
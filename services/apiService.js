const axios = require('axios');
const NodeCache = require('node-cache');
const config = require('../config/config');
const logger = require('../utils/logger');

class ApiService {
  constructor() {
    this.cache = new NodeCache({ stdTTL: 300 });
    this.axiosInstance = axios.create({
      baseURL: config.baxusApi.baseUrl,
      timeout: config.baxusApi.timeout
    });
  }

  async getUserBar(username) {
    const cacheKey = `user_bar_${username}`;
    const cachedData = this.cache.get(cacheKey);
    
    if (cachedData) {
      return cachedData;
    }

    try {
      const response = await this.axiosInstance.get(
        `${config.baxusApi.endpoints.userBar}/${username}`
      );
      
      if (!response.data || !Array.isArray(response.data)) {
        throw new Error('Invalid user bar data format');
      }

      const userProfile = {};
      
      const normalized = response.data.map(item => ({
        id: item.id,
        bar_id: item.bar_id,
        price: item.price,
        note: item.note,
        created_at: item.created_at,
        updated_at: item.updated_at,
        user_id: item.user_id,
        release_id: item.release_id,
        fill_percentage: item.fill_percentage,
        added: item.added,
        user: item.user,
        product: {
          id: item.product.id,
          name: item.product.name,
          image_url: item.product.image_url,
          brand_id: item.product.brand_id,
          brand: item.product.brand,
          spirit: item.product.spirit,
          size: item.product.size,
          proof: item.product.proof,
          average_msrp: item.product.average_msrp,
          fair_price: item.product.fair_price,
          shelf_price: item.product.shelf_price,
          popularity: item.product.popularity,
          barcode: item.product.barcode,
          barrel_pick: item.product.barrel_pick,
          private: item.product.private,
          verified_date: item.product.verified_date
        }
      }));

      userProfile.whiskies = normalized;
      userProfile.whisky_ids = response.data.map(item=>parseInt(item.product.id, 10));
      
      this.cache.set(cacheKey, userProfile);
      return userProfile;
    } catch (error) {
      if (error.response && error.response.status === 404) {
        logger.info(`User ${username} has no bar items or doesn't exist`);
        return [];
      }
      logger.error('API Service Error:', error.message);
      throw new Error('Failed to fetch user bar data');
    }
  }
}

module.exports = new ApiService();
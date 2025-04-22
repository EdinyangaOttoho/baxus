module.exports = {
  baxusApi: {
    baseUrl: 'https://services.baxus.co/api',
    endpoints: {
      userBar: '/bar/user'
    },
    timeout: 5000
  },
  recommendation: {
    maxRecommendations: 10,
    minSimilarityScore: 0.2,
    coldStartStrategy: 'hybrid',
    weights: {
      contentBased: 0.6,
      popularity: 0.2,
      diversity: 0.2
    },
    contentFields: {
      name: 0.4,
      brand: 0.3,
      spiritType: 0.2,
      proof: 0.05,
      tastingNotes: 0.05,
      price: 0.6,
      visual: 0.9
    }
  },
  cache: {
    stdTTL: 3600,
    checkperiod: 600
  }
};

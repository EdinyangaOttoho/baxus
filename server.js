const express = require('express');
const tf = require('@tensorflow/tfjs-node');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { getImageEmbedding } = require('./imageEmbedding');

// Config
const MODEL_PATH = path.join(__dirname, 'model.json');
const DATASET_PATH = path.join(__dirname, 'dataset.csv');
const EXTERNAL_API_URL = 'https://services.baxus.co/api/bar/user/';
const USER_EMBEDDING_SIZE = 50;
const WHISKY_EMBEDDING_SIZE = 50;
const IMAGE_EMBEDDING_SIZE = 128;
const USER_VOCAB_SIZE = 1_000_000; // For hashing user IDs
const CAT_EMBEDDING_SIZE = 10; // For spirit_type, brand_id, size

const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json({ limit: '50mb' }));

let model;
let whiskyData = [];
let whiskyIdToIndex = new Map();

// Utility: Hash user ID to fixed range
function hashUserId(userId) {
  const str = String(userId);
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & 0xFFFFFFFF;
  }
  return Math.abs(hash) % USER_VOCAB_SIZE;
}

// Utility: Hash categorical string to integer
function hashCategory(value, max = 1000) {
  if (!value) return 0;
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) % max;
  }
  return hash;
}

// Normalize numeric features to [0,1]
function normalizeFeature(value, min, max) {
  if (max === min) return 0;
  return (value - min) / (max - min);
}

// Extract normalized numeric feature vector from whisky
function extractNumericFeatures(whisky) {
  const ranges = {
    proof: [0, 150],
    abv: [0, 75],
    popularity: [0, 100000],
    avg_msrp: [0, 500],
    fair_price: [0, 500],
    shelf_price: [0, 500],
    total_score: [0, 100000],
    wishlist_count: [0, 10000],
    vote_count: [0, 10000],
    bar_count: [0, 10000],
    ranking: [0, 1000],
  };
  return [
    normalizeFeature(whisky.proof, ...ranges.proof),
    normalizeFeature(whisky.abv, ...ranges.abv),
    normalizeFeature(whisky.popularity, ...ranges.popularity),
    normalizeFeature(whisky.avg_msrp, ...ranges.avg_msrp),
    normalizeFeature(whisky.fair_price, ...ranges.fair_price),
    normalizeFeature(whisky.shelf_price, ...ranges.shelf_price),
    normalizeFeature(whisky.total_score, ...ranges.total_score),
    normalizeFeature(whisky.wishlist_count, ...ranges.wishlist_count),
    normalizeFeature(whisky.vote_count, ...ranges.vote_count),
    normalizeFeature(whisky.bar_count, ...ranges.bar_count),
    normalizeFeature(whisky.ranking, ...ranges.ranking),
  ];
}

// Load whisky dataset and build index
async function loadDataset() {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(DATASET_PATH)
      .pipe(csv())
      .on('data', (data) => {
        const parsed = {
          id: data.id,
          name: data.name,
          size: data.size,
          proof: parseFloat(data.proof) || 0,
          abv: parseFloat(data.abv) || 0,
          spirit_type: data.spirit_type,
          brand_id: data.brand_id,
          popularity: parseInt(data.popularity) || 0,
          image_url: data.image_url,
          avg_msrp: parseFloat(data.avg_msrp) || 0,
          fair_price: parseFloat(data.fair_price) || 0,
          shelf_price: parseFloat(data.shelf_price) || 0,
          total_score: parseInt(data.total_score) || 0,
          wishlist_count: parseInt(data.wishlist_count) || 0,
          vote_count: parseInt(data.vote_count) || 0,
          bar_count: parseInt(data.bar_count) || 0,
          ranking: parseInt(data.ranking) || 0,
        };
        results.push(parsed);
      })
      .on('end', () => {
        whiskyData = results;
        whiskyData.forEach((w, i) => whiskyIdToIndex.set(w.id, i));
        resolve();
      })
      .on('error', reject);
  });
}

// Create the TensorFlow.js model
function createModel() {
  const userInput = tf.input({ shape: [1], dtype: 'int32', name: 'userInput' });
  const whiskyIdInput = tf.input({ shape: [1], dtype: 'int32', name: 'whiskyIdInput' });
  const whiskyCatInput = tf.input({ shape: [3], dtype: 'int32', name: 'whiskyCatInput' }); // spirit_type, brand_id, size
  const whiskyNumInput = tf.input({ shape: [11], dtype: 'float32', name: 'whiskyNumInput' });
  const imageEmbeddingInput = tf.input({ shape: [IMAGE_EMBEDDING_SIZE], dtype: 'float32', name: 'imageEmbeddingInput' });

  const userEmbeddingLayer = tf.layers.embedding({ inputDim: USER_VOCAB_SIZE, outputDim: USER_EMBEDDING_SIZE, embeddingsInitializer: 'uniform' });
  const whiskyIdEmbeddingLayer = tf.layers.embedding({ inputDim: whiskyData.length + 10, outputDim: WHISKY_EMBEDDING_SIZE, embeddingsInitializer: 'uniform' });
  const catEmbeddingLayer = tf.layers.embedding({ inputDim: 1000, outputDim: CAT_EMBEDDING_SIZE, embeddingsInitializer: 'uniform' });

  const userEmbedded = userEmbeddingLayer.apply(userInput);
  const userVec = tf.layers.flatten().apply(userEmbedded);

  const whiskyIdEmbedded = whiskyIdEmbeddingLayer.apply(whiskyIdInput);
  const whiskyIdVec = tf.layers.flatten().apply(whiskyIdEmbedded);

  const spiritEmbed = catEmbeddingLayer.apply(tf.slice(whiskyCatInput, [0, 0], [-1, 1]));
  const brandEmbed = catEmbeddingLayer.apply(tf.slice(whiskyCatInput, [0, 1], [-1, 1]));
  const sizeEmbed = catEmbeddingLayer.apply(tf.slice(whiskyCatInput, [0, 2], [-1, 1]));
  const spiritVec = tf.layers.flatten().apply(spiritEmbed);
  const brandVec = tf.layers.flatten().apply(brandEmbed);
  const sizeVec = tf.layers.flatten().apply(sizeEmbed);
  const catVec = tf.layers.concatenate().apply([spiritVec, brandVec, sizeVec]);

  const whiskyFeatures = tf.layers.concatenate().apply([whiskyIdVec, catVec, whiskyNumInput, imageEmbeddingInput]);
  const combined = tf.layers.concatenate().apply([userVec, whiskyFeatures]);

  const dense1 = tf.layers.dense({ units: 128, activation: 'relu' }).apply(combined);
  const dense2 = tf.layers.dense({ units: 64, activation: 'relu' }).apply(dense1);
  const dense3 = tf.layers.dense({ units: 32, activation: 'relu' }).apply(dense2);
  const output = tf.layers.dense({ units: 1, activation: 'linear' }).apply(dense3);

  const model = tf.model({
    inputs: [userInput, whiskyIdInput, whiskyCatInput, whiskyNumInput, imageEmbeddingInput],
    outputs: output,
  });

  model.compile({
    optimizer: tf.train.adam(0.001),
    loss: 'meanSquaredError',
    metrics: ['mae'],
  });

  return model;
}

// Synthetic training data for demonstration (use real feedback in production)
async function createTrainingData() {
  const trainingData = [];
  const userCount = 1000; // Synthetic users
  for (let userId = 1; userId <= userCount; userId++) {
    for (let i = 0; i < 5; i++) {
      const whisky = whiskyData[Math.floor(Math.random() * whiskyData.length)];
      if (!whisky) continue;
      const imageEmbedding = await fetchImageEmbedding(whisky.id);
      if (!imageEmbedding) continue;

      const numericFeatures = extractNumericFeatures(whisky);
      let rating = numericFeatures[6] + (Math.random() * 0.2 - 0.1);
      rating = Math.min(Math.max(rating, 0), 1);

      trainingData.push({
        userId,
        whiskyId: whiskyIdToIndex.get(whisky.id),
        catFeatures: [
          hashCategory(whisky.spirit_type),
          parseInt(whisky.brand_id) || 0,
          hashCategory(whisky.size),
        ],
        numericFeatures,
        imageEmbedding,
        rating,
      });
    }
  }
  return trainingData;
}

// Fetch image embedding for a whisky
async function fetchImageEmbedding(whiskyId) {
  const whisky = whiskyData.find(w => w.id === String(whiskyId));
  if (!whisky || !whisky.image_url) return null;
  try {
    return await getImageEmbedding(whisky.image_url);
  } catch (err) {
    console.error(`Failed to get image embedding for whisky ID ${whiskyId}:`, err);
    return null;
  }
}

// Model training and saving
async function trainAndSaveModel() {
  model = createModel();
  const trainingData = await createTrainingData();
  if (!trainingData || trainingData.length === 0) {
    console.warn('No training data could be generated. Skipping model training.');
    return;
  }

  const userIds = trainingData.map(d => d.userId);
  const whiskyIds = trainingData.map(d => d.whiskyId);
  const catFeatures = trainingData.map(d => d.catFeatures);
  const numericFeatures = trainingData.map(d => d.numericFeatures);
  const imageEmbeddings = trainingData.map(d => d.imageEmbedding);
  const ratings = trainingData.map(d => d.rating);

  const userTensor = tf.tensor1d(userIds, 'int32');
  const whiskyIdTensor = tf.tensor1d(whiskyIds, 'int32');
  const catTensor = tf.tensor2d(catFeatures, [catFeatures.length, 3], 'int32');
  const numTensor = tf.tensor2d(numericFeatures, [numericFeatures.length, 11], 'float32');
  const imageTensor = tf.tensor2d(imageEmbeddings, [imageEmbeddings.length, IMAGE_EMBEDDING_SIZE], 'float32');
  const ratingTensor = tf.tensor1d(ratings, 'float32');

  await model.fit([userTensor, whiskyIdTensor, catTensor, numTensor, imageTensor], ratingTensor, { epochs: 10 });
  await model.save(`file://${MODEL_PATH}`);
  console.log('Model trained and saved successfully');
}

// Load model or train if missing
async function loadModelFromFile() {
  try {
    model = await tf.loadLayersModel(`file://${MODEL_PATH}`);
    console.log('Model loaded successfully from file');
  } catch (error) {
    console.error('Error loading the model from file. Training a new model...');
    await trainAndSaveModel();
  }
}

// Fetch user preferences from external API
async function fetchUserPreferencesFromAPI(username) {
  try {
    const response = await axios.get(`${EXTERNAL_API_URL}${username}`);
    if (response.status !== 200) throw new Error(`API returned status ${response.status}`);
    const data = response.data;
    if (!Array.isArray(data)) throw new Error('API returned unexpected data format');
    return data.map(item => ({
      spirit: item.product.spirit,
      brand: item.product.brand,
      size: item.product.size,
      proof: item.product.proof,
      average_msrp: item.product.average_msrp,
      fair_price: item.product.fair_price,
      shelf_price: item.product.shelf_price,
    }));
  } catch (err) {
    console.error('Error fetching user preferences:', err);
    throw err;
  }
}

// Generate recommendation description considering all fields
function generateRecommendationDescription(whisky, userPreferences) {
  const reasons = [];
  const checkMatch = (field) =>
    userPreferences.some(pref => pref[field] && whisky[field] &&
      String(pref[field]).toLowerCase() === String(whisky[field]).toLowerCase());

  if (checkMatch('spirit')) reasons.push(`its spirit type (${whisky.spirit_type}) matching your preferences`);
  if (checkMatch('brand')) reasons.push(`its brand (${whisky.brand_id}) matching your preferences`);
  if (checkMatch('size')) reasons.push(`its size (${whisky.size}) matching your preferences`);
  if (checkMatch('proof')) reasons.push(`its proof (${whisky.proof}) matching your preferences`);
  if (checkMatch('average_msrp')) reasons.push(`its average MSRP (${whisky.avg_msrp}) matching your preferences`);
  if (checkMatch('fair_price')) reasons.push(`its fair price (${whisky.fair_price}) matching your preferences`);
  if (checkMatch('shelf_price')) reasons.push(`its shelf price (${whisky.shelf_price}) matching your preferences`);
  if (parseInt(whisky.total_score) > 80000) reasons.push(`its high total score (${whisky.total_score})`);

  if (reasons.length === 0) return 'This whisky is recommended based on its general popularity and quality.';
  return `This whisky was selected based on ${reasons.join(' and ')}.`;
}

// Main recommendation endpoint
app.get('/recommendations/:userId', async (req, res) => {
  const { userId } = req.params;
  if (!userId) return res.status(400).json({ error: 'User ID is required' });

  try {
    const userPreferences = await fetchUserPreferencesFromAPI(userId);
    if (!userPreferences || userPreferences.length === 0) {
      return res.status(404).json({ error: 'No whisky selections found for this user' });
    }
    const userHash = hashUserId(userId);

    const recommendations = [];
    for (const whisky of whiskyData) {
      const whiskyIndex = whiskyIdToIndex.get(whisky.id);
      if (whiskyIndex === undefined) continue;

      const whiskyIdTensor = tf.tensor1d([whiskyIndex], 'int32');
      const userTensor = tf.tensor1d([userHash], 'int32');
      const catTensor = tf.tensor2d([[
        hashCategory(whisky.spirit_type),
        parseInt(whisky.brand_id) || 0,
        hashCategory(whisky.size)
      ]], [1, 3], 'int32');
      const numericFeatures = extractNumericFeatures(whisky);
      const numTensor = tf.tensor2d([numericFeatures], [1, numericFeatures.length], 'float32');
      const imageEmbedding = await fetchImageEmbedding(whisky.id);
      if (!imageEmbedding) continue;
      const imageTensor = tf.tensor2d([imageEmbedding], [1, IMAGE_EMBEDDING_SIZE], 'float32');

      const predTensor = model.predict([userTensor, whiskyIdTensor, catTensor, numTensor, imageTensor]);
      const score = (await predTensor.data())[0];

      const description = generateRecommendationDescription(whisky, userPreferences);

      recommendations.push({
        whiskyId: whisky.id,
        name: whisky.name,
        score,
        description,
      });

      userTensor.dispose();
      whiskyIdTensor.dispose();
      catTensor.dispose();
      numTensor.dispose();
      imageTensor.dispose();
      predTensor.dispose();
    }

    recommendations.sort((a, b) => b.score - a.score);
    res.json(recommendations);
  } catch (err) {
    console.error('Error generating recommendations:', err);
    res.status(500).json({ error: 'Failed to generate recommendations' });
  }
});

// Initialize everything and start server
(async () => {
  await loadDataset();
  await loadModelFromFile();
  app.listen(PORT, () => {
    console.log(`Whisky recommendation API running on port ${PORT}`);
  });
})();
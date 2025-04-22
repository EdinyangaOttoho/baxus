const tf = require('@tensorflow/tfjs-node');
const mobilenet = require('@tensorflow-models/mobilenet');
const sharp = require('sharp');
const path = require('path');
const csv = require('csv-parser');
const fs = require('fs');

const fetchWrapper = async (url) => {
    const { default: fetch } = await import('node-fetch');
    return fetch(url);
}

class ImageProcessor {

    constructor() {
        this.model = null;
        this.datasetEmbeddings = new Map();
        this.dataset = []; // Store dataset here
    }

    async initialize() {
        try {
            this.model = await mobilenet.load();
            console.log('MobileNet model loaded.');
            await this._loadDataset();
            console.log('Dataset loaded.');
            await this._precomputeDatasetEmbeddings();
            console.log('Dataset embeddings precomputed.');
        } catch (error) {
            console.error('Error initializing ImageProcessor:', error);
            throw error;
        }
    }

    async _loadDataset() {
        return new Promise((resolve, reject) => {
            const filePath = path.join(__dirname, '../data/dataset.csv');
            fs.createReadStream(filePath)
                .pipe(csv())
                .on('data', (row) => {
                    // Convert string values to numbers where applicable
                    row.id = parseInt(row.id, 10);
                    row.popularity = parseInt(row.popularity, 10);
                    row.avg_msrp = parseFloat(row.avg_msrp);
                    row.fair_price = parseFloat(row.fair_price);
                    row.shelf_price = parseFloat(row.shelf_price);
                    row.total_score = parseInt(row.total_score, 10);
                    this.dataset.push(row);
                })
                .on('end', () => {
                    console.log('CSV parsing complete');
                    resolve();
                })
                .on('error', (error) => {
                    console.error('Error reading CSV:', error);
                    reject(error);
                });
        });
    }

    async _precomputeDatasetEmbeddings() {
        let count = 0;
        for (const whisky of this.dataset) {
            count++;
            try {
                const embedding = await this._getImageEmbedding(whisky.image_url);
                this.datasetEmbeddings.set(whisky.id, embedding);
                console.log(`Compiled image: ${count} / 501 [${whisky.id}]`);
            } catch (error) {
                console.error(`Error processing image for whisky ${whisky.id}:`, error);
                // Handle the error, possibly skip this whisky
            }
        }
    }

    async _getImageEmbedding(imageUrl) {
        try {
            const response = await fetchWrapper(imageUrl);
            const imageBuffer = await response.arrayBuffer();

            const pngBuffer = await sharp(imageBuffer)
                .png()
                .toBuffer();

            const imageTensor = tf.node.decodeImage(pngBuffer, 3);

            if (imageTensor.shape[2] !== 3) {
                imageTensor.dispose();
                throw new Error(`Invalid image format: ${imageUrl}`);
            }
            const embedding = this.model.infer(imageTensor, true);
            imageTensor.dispose();
            return embedding;
        } catch (error) {
            console.error(`Failed to get embedding for ${imageUrl}:`, error);
            throw error;
        }
    }

    _cosineSimilarity(vectorA, vectorB) {
      if (!vectorA || !vectorB) return 0;

      const dotProduct = tf.sum(tf.mul(vectorA, vectorB)).dataSync()[0];
      const magnitudeA = tf.norm(vectorA).dataSync()[0];
      const magnitudeB = tf.norm(vectorB).dataSync()[0];

      if (magnitudeA === 0 || magnitudeB === 0) return 0;

      return dotProduct / (magnitudeA * magnitudeB);

    }

    calculateVisualSimilarity(userWhiskyIds, candidateId) {
        
        if (!userWhiskyIds || userWhiskyIds.length === 0) {
            return 0; // No user whiskeys provided
        }

        if (!this.datasetEmbeddings.has(candidateId)) {
            return 0; // No embedding for candidate
        }

        try {
            const candidateEmbedding = this.datasetEmbeddings.get(candidateId);
            if (!candidateEmbedding) return 0;

            let totalSimilarity = 0;
            let validWhiskyCount = 0;

            userWhiskyIds.forEach(whiskyId => {
                if (this.datasetEmbeddings.has(whiskyId)) {
                    const userEmbedding = this.datasetEmbeddings.get(whiskyId);
                    if (!userEmbedding) return;
                    const similarity = this._cosineSimilarity(userEmbedding, candidateEmbedding);
                    totalSimilarity += similarity;
                    validWhiskyCount++;
                }
            });

            return validWhiskyCount > 0 ? totalSimilarity / validWhiskyCount : 0;
        } catch (error) {
            console.error(`Error calculating visual similarity for ${candidateId}:`, error);
            return 0;
        }
    }

}

const imageSimilarity = new ImageProcessor();
module.exports = imageSimilarity;
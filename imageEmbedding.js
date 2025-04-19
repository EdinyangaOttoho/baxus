const tf = require('@tensorflow/tfjs-node');
const axios = require('axios');
const mobilenet = require('@tensorflow-models/mobilenet');

let net = null;

async function loadModel() {
  if (!net) {
    net = await mobilenet.load();
    console.log('MobileNet model loaded for image embedding.');
  }
}

// Download image and extract embedding
async function getImageEmbedding(imageUrl) {
  await loadModel();
  const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
  const buffer = Buffer.from(response.data, 'binary');
  const image = tf.node.decodeImage(buffer, 3);
  const resized = tf.image.resizeBilinear(image, [224, 224]);
  const normalized = resized.div(255.0).expandDims(0);
  const embedding = net.infer(normalized, 'conv_preds').squeeze();
  const embeddingArray = await embedding.array();
  image.dispose();
  resized.dispose();
  normalized.dispose();
  embedding.dispose();
  return embeddingArray;
}

module.exports = { getImageEmbedding };
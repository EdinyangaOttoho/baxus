const natural = require('natural');
const compromise = require('compromise');
const cosineSimilarity = require('compute-cosine-similarity');
const { WordNet } = natural;
const wordnet = new WordNet();

const tfidf = new natural.TfIdf();
const tokenizer = new natural.WordTokenizer();
const synonymCache = new Map();

module.exports = {
  calculateJaccardSimilarity(setA, setB) {
    const intersection = new Set([...setA].filter(x => setB.includes(x))).size;
    const union = new Set([...setA, ...setB]).size;
    return union === 0 ? 0 : intersection / union;
  },

  async calculateTextSimilarity(text1, text2) {
    if (!text1 || !text2) return 0;
    
    const tokens1 = tokenizer.tokenize(text1.toLowerCase());
    const tokens2 = tokenizer.tokenize(text2.toLowerCase());
    
    const jaccard = this.calculateJaccardSimilarity(tokens1, tokens2);
    
    tfidf.addDocument(tokens1.join(' '));
    tfidf.addDocument(tokens2.join(' '));
    
    const vec1 = {};
    const vec2 = {};
    
    tfidf.listTerms(0).forEach(item => vec1[item.term] = item.tfidf);
    tfidf.listTerms(1).forEach(item => vec2[item.term] = item.tfidf);

    const allKeys = [...new Set([
      ...Object.keys(vec1),
      ...Object.keys(vec2)
    ])];

    function dictToArray(dict, keys) {
      return keys.map(key => dict[key] || 0);
    }
    
    const array1 = dictToArray(vec1, allKeys);
    const array2 = dictToArray(vec2, allKeys);
    
    const cosine = cosineSimilarity(array1, array2);
    
    const doc1 = compromise(text1);
    const doc2 = compromise(text2);
    
    const nouns1 = doc1.nouns().out('array');
    const nouns2 = doc2.nouns().out('array');
    
    let synonymScore = 0;
    const maxPairs = nouns1.length * nouns2.length;
    
    if (maxPairs > 0) {
      for (const noun1 of nouns1) {
        for (const noun2 of nouns2) {
          if (noun1 === noun2) {
            synonymScore += 0.2;
            continue;
          }
          
          const cacheKey = `${noun1}_${noun2}`;
          if (synonymCache.has(cacheKey)) {
            if (synonymCache.get(cacheKey)) synonymScore += 0.1;
            continue;
          }
          
          const isSynonym = await new Promise(resolve => {
            wordnet.lookup(noun1, (results) => {
              const synonyms = results.flatMap(r => r.synonyms);
              synonymCache.set(cacheKey, synonyms.includes(noun2));
              resolve(synonyms.includes(noun2));
            });
          });
          
          if (isSynonym) synonymScore += 0.1;
        }
      }
      
      synonymScore = synonymScore / maxPairs;
    }
    
    tfidf.documents = [];
    
    return (jaccard * 0.5 + cosine * 0.3 + synonymScore * 0.2);
  },

  calculateProofSimilarity(proof1, proof2) {
    const diff = Math.abs(proof1 - proof2);
    return 1 - (diff / 150);
  }
};
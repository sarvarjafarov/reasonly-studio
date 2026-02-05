const { GenerativeLanguage } = require('@google/genai');
const config = require('../config/config');

let clientInstance = null;

function getClient() {
  if (clientInstance) {
    return clientInstance;
  }

  if (config.useGemini && !config.geminiApiKey) {
    throw new Error('GEMINI_API_KEY is required when USE_GEMINI=true');
  }

  clientInstance = new GenerativeLanguage({
    apiKey: config.geminiApiKey,
  });
  return clientInstance;
}

module.exports = {
  getClient,
};

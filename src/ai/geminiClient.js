const axios = require('axios');
const config = require('../config/config');

function ensureApiKey() {
  if (config.useGemini && !config.geminiApiKey) {
    throw new Error('GEMINI_API_KEY is required when USE_GEMINI=true');
  }
}

async function generate(prompt) {
  ensureApiKey();

  // Use generateContent endpoint with x-goog-api-key header (Gemini 3 recommended)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent`;

  const payload = {
    contents: [
      {
        parts: [
          { text: prompt }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 4096,
    },
  };

  const response = await axios.post(url, payload, {
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': config.geminiApiKey,
    },
  });

  const candidate = response.data?.candidates?.[0];
  if (!candidate) {
    throw new Error('Gemini response missing candidates');
  }

  // Extract text from Gemini 3 response format
  const text = candidate?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini candidate contained no text output');
  }

  return text;
}

module.exports = {
  generate,
};

const axios = require('axios');
const config = require('../config/config');

function ensureApiKey() {
  if (config.useGemini && !config.geminiApiKey) {
    throw new Error('GEMINI_API_KEY is required when USE_GEMINI=true');
  }
}

async function generate(prompt) {
  ensureApiKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateText`;
  const payload = {
    prompt: {
      text: prompt,
    },
    temperature: 0.2,
    candidateCount: 1,
  };

  const response = await axios.post(url, payload, {
    headers: {
      Authorization: `Bearer ${config.geminiApiKey}`,
      'Content-Type': 'application/json',
    },
  });

  const candidate = response.data?.candidates?.[0];
  if (!candidate) {
    throw new Error('Gemini response missing candidates');
  }

  const text = candidate?.content?.[0]?.text || candidate?.output?.[0]?.content?.[0]?.text;
  if (!text) {
    throw new Error('Gemini candidate contained no text output');
  }

  return text;
}

module.exports = {
  generate,
};

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

  try {
    console.log(`Gemini request: model=${config.geminiModel}`);
    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': config.geminiApiKey,
      },
      timeout: 25000, // 25s timeout to avoid Heroku 30s limit
    });

    const candidate = response.data?.candidates?.[0];
    if (!candidate) {
      console.error('Gemini response:', JSON.stringify(response.data));
      throw new Error('Gemini response missing candidates');
    }

    // Extract text from Gemini 3 response format
    const text = candidate?.content?.parts?.[0]?.text;
    if (!text) {
      console.error('Gemini candidate:', JSON.stringify(candidate));
      throw new Error('Gemini candidate contained no text output');
    }

    return text;
  } catch (err) {
    // Log detailed error info
    if (err.response) {
      const status = err.response.status;
      const data = err.response.data;
      console.error(`Gemini API error: ${status}`, typeof data === 'string' ? data.slice(0, 500) : JSON.stringify(data));

      if (status === 429) {
        throw new Error('Gemini rate limit exceeded. Please try again later.');
      }
      if (status === 404) {
        throw new Error(`Gemini model "${config.geminiModel}" not found. Check GEMINI_MODEL setting.`);
      }
      if (status === 400) {
        throw new Error(`Gemini bad request: ${data?.error?.message || 'Invalid request'}`);
      }
    }
    throw err;
  }
}

module.exports = {
  generate,
};

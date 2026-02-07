const axios = require('axios');
const config = require('../config/config');

function ensureApiKey() {
  if (!config.geminiApiKey) {
    throw new Error('GEMINI_API_KEY is required. Please set it in environment variables.');
  }
}

// Sleep helper for retry delays
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function generate(prompt, retries = 2) {
  ensureApiKey();

  // Use generateContent endpoint with x-goog-api-key header
  const model = config.geminiModel || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

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

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      console.log(`Gemini request: model=${model}, attempt=${attempt + 1}`);
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

      // Extract text from response
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
          // Rate limit - extract retry delay if available
          const retryInfo = data?.error?.details?.find(d => d['@type']?.includes('RetryInfo'));
          const retryDelay = retryInfo?.retryDelay ? parseInt(retryInfo.retryDelay) * 1000 : 5000;

          if (attempt < retries) {
            console.log(`Rate limited, waiting ${retryDelay}ms before retry...`);
            await sleep(Math.min(retryDelay, 10000)); // Cap at 10 seconds
            continue;
          }
          throw new Error('AI service is temporarily busy. Please wait a moment and try again.');
        }
        if (status === 404) {
          throw new Error(`Gemini model "${model}" not found. Check GEMINI_MODEL setting.`);
        }
        if (status === 400) {
          throw new Error(`Gemini bad request: ${data?.error?.message || 'Invalid request'}`);
        }
      }

      // For other errors, only retry if we have retries left
      if (attempt < retries) {
        console.log(`Error occurred, retrying in 2s...`);
        await sleep(2000);
        continue;
      }

      throw err;
    }
  }
}

module.exports = {
  generate,
};

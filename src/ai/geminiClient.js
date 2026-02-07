const axios = require('axios');
const config = require('../config/config');

// Sleep helper for retry delays
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate text using Gemini API
 */
async function generateWithGemini(prompt, retries = 1) {
  if (!config.geminiApiKey) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const model = config.geminiModel || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
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
        timeout: 25000,
      });

      const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error('Gemini response missing text');
      }
      return { text, provider: 'gemini' };
    } catch (err) {
      if (err.response?.status === 429) {
        const data = err.response.data;
        console.error('Gemini quota exceeded:', JSON.stringify(data?.error?.message || data).slice(0, 200));

        // Check if this is a daily quota issue (limit: 0)
        const isQuotaExhausted = JSON.stringify(data).includes('limit: 0') ||
                                  JSON.stringify(data).includes('limit":0');

        if (isQuotaExhausted) {
          // Daily quota exhausted - don't retry, throw special error
          const quotaError = new Error('GEMINI_QUOTA_EXHAUSTED');
          quotaError.isQuotaExhausted = true;
          throw quotaError;
        }

        // Temporary rate limit - retry after delay
        if (attempt < retries) {
          console.log('Rate limited, waiting 5s before retry...');
          await sleep(5000);
          continue;
        }
      }
      throw err;
    }
  }
}

/**
 * Generate text using Anthropic API (fallback)
 */
async function generateWithAnthropic(prompt) {
  if (!config.anthropic?.apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const Anthropic = require('@anthropic-ai/sdk');
  const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

  console.log('Using Anthropic API as fallback...');

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content[0]?.text;
  if (!text) {
    throw new Error('Anthropic response missing text');
  }
  return { text, provider: 'anthropic' };
}

/**
 * Main generate function - tries Gemini first, falls back to Anthropic
 */
async function generate(prompt) {
  // Try Gemini first if enabled
  if (config.geminiApiKey) {
    try {
      const result = await generateWithGemini(prompt);
      return result.text;
    } catch (err) {
      // If quota exhausted and we have Anthropic key, fall back
      if (err.isQuotaExhausted && config.anthropic?.apiKey) {
        console.log('Gemini quota exhausted, falling back to Anthropic...');
      } else if (config.anthropic?.apiKey) {
        console.log('Gemini failed, falling back to Anthropic:', err.message);
      } else {
        // No fallback available
        if (err.isQuotaExhausted) {
          throw new Error('AI service daily quota exhausted. Please try again tomorrow or upgrade your plan.');
        }
        throw err;
      }
    }
  }

  // Try Anthropic as fallback or primary if Gemini not configured
  if (config.anthropic?.apiKey) {
    try {
      const result = await generateWithAnthropic(prompt);
      return result.text;
    } catch (err) {
      console.error('Anthropic API error:', err.message);
      throw new Error('AI service unavailable. Please try again later.');
    }
  }

  throw new Error('No AI API keys configured. Please set GEMINI_API_KEY or ANTHROPIC_API_KEY.');
}

module.exports = {
  generate,
  generateWithGemini,
  generateWithAnthropic,
};

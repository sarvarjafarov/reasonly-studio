const express = require('express');
const config = require('../../config/config');
const {
  runAgent,
  runGeminiAgent,
  createScopeErrorResponse,
  validateScopeInput,
} = require('../../agents/marketingAnalyst.agent');

const router = express.Router();

// Timeout wrapper for Gemini calls (25 seconds to leave buffer for Heroku's 30s limit)
function withTimeout(promise, ms = 25000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Gemini timeout - falling back to fast mode')), ms)
    )
  ]);
}

function validateRequest(body) {
  if (!body.workspaceId || typeof body.workspaceId !== 'string') return 'workspaceId is required';
  if (!body.question || typeof body.question !== 'string') return 'question is required';
  if (!body.dateRange || !body.dateRange.start || !body.dateRange.end) return 'dateRange.start and end are required';
  return null;
}

function sendScopeError(res, question, debug, reason) {
  const finalResponse = createScopeErrorResponse(question, reason);
  if (debug) {
    return res.json({
      result: finalResponse,
      trace: { validation: ['scope_missing'], plan_steps: [], tool_calls: [] },
    });
  }
  return res.json(finalResponse);
}

router.post('/analyze', async (req, res) => {
  const validationError = validateRequest(req.body);
  if (validationError) {
    return res.status(400).json({ success: false, message: validationError });
  }

  const agentInput = {
    workspaceId: req.body.workspaceId,
    question: req.body.question,
    dateRange: req.body.dateRange,
    compareMode: req.body.compareMode,
    primaryKpi: req.body.primaryKpi,
    scope: req.body.scope,
  };

  const scopeError = validateScopeInput(req.body.scope);
  if (scopeError) {
    return sendScopeError(res, req.body.question, req.body.debug, scopeError);
  }

  try {
    if (config.useGemini) {
      console.log('AI analyze mode: gemini (with 25s timeout)');
      try {
        const result = await withTimeout(runGeminiAgent(agentInput, { debug: req.body.debug }), 25000);
        return res.json(result);
      } catch (err) {
        console.warn('Gemini agent failed or timed out, falling back to fast mode:', err.message);
        const fallback = await runAgent(agentInput);
        if (req.body.debug) {
          return res.json({
            result: fallback,
            trace: { validation: ['deterministic_fallback'], plan_steps: [], tool_calls: [] },
          });
        }
        return res.json(fallback);
      }
    }

    console.log('AI analyze mode: deterministic');
    const result = await runAgent(agentInput);
    if (req.body.debug) {
      return res.json({ result, trace: { validation: ['deterministic_mode'], plan_steps: [], tool_calls: [] } });
    }

    return res.json(result);
  } catch (error) {
    console.error('AI analyze error:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to run analyst right now' });
  }
});

module.exports = router;

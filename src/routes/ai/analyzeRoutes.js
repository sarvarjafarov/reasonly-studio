const express = require('express');
const config = require('../../config/config');
const { runAgent, runGeminiAgent } = require('../../agents/marketingAnalyst.agent');

const router = express.Router();

function validateRequest(body) {
  if (!body.workspaceId || typeof body.workspaceId !== 'string') return 'workspaceId is required';
  if (!body.question || typeof body.question !== 'string') return 'question is required';
  if (!body.dateRange || !body.dateRange.start || !body.dateRange.end) return 'dateRange.start and end are required';
  return null;
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
  };

  try {
    if (config.useGemini) {
      console.log('AI analyze mode: gemini');
      try {
        return res.json(await runGeminiAgent(agentInput, { debug: req.body.debug }));
      } catch (err) {
        console.warn('Gemini agent failed, falling back:', err.message);
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

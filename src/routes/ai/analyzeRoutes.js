const express = require('express');
const config = require('../../config/config');
const { runAgent, runGeminiAgent } = require('../../agents/marketingAnalyst.agent');

const router = express.Router();

function validateRequest(body) {
  const { workspaceId, question, dateRange } = body;
  if (!workspaceId || !question) {
    return 'workspaceId and question are required';
  }
  if (!dateRange || !dateRange.start || !dateRange.end) {
    return 'dateRange.start and dateRange.end are required';
  }
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
        const response = await runGeminiAgent(agentInput);
        return res.json(response);
      } catch (err) {
        console.warn('Gemini failed, falling back to deterministic agent:', err.message);
      }
    }

    console.log('AI analyze mode: deterministic');
    const response = await runAgent(agentInput);
    return res.json(response);
  } catch (error) {
    console.error('AI analyze error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Unable to process analyst request at the moment.',
    });
  }
});

module.exports = router;

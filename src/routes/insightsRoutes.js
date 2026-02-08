/**
 * Insights Routes - API endpoints for daily insights
 */

const express = require('express');
const router = express.Router();
const { generateDailyInsights } = require('../services/insightsService');
const authenticate = require('../middleware/auth');
const Workspace = require('../models/Workspace');

/**
 * GET /api/insights/daily
 * Get daily insights for a workspace
 *
 * Query params:
 * - workspaceId: UUID of the workspace
 */
router.get('/daily', authenticate, async (req, res) => {
  try {
    const { workspaceId } = req.query;

    if (!workspaceId) {
      return res.status(400).json({
        success: false,
        message: 'workspaceId is required',
      });
    }

    // Verify user has access to this workspace
    const hasAccess = await Workspace.isMember(workspaceId, req.user.id);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this workspace',
      });
    }

    console.log(`[Insights API] Generating insights for workspace ${workspaceId}`);

    const result = await generateDailyInsights(workspaceId, req.user.id);

    console.log(`[Insights API] Generated ${result.data?.insights?.length || 0} insights`);

    res.json(result);
  } catch (error) {
    console.error('[Insights API] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate insights',
      error: error.message,
    });
  }
});

module.exports = router;

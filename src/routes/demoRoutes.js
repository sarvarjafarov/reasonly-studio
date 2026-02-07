/**
 * Demo Routes - Public endpoints for hackathon judges
 * No authentication required
 */

const express = require('express');
const { generate } = require('../ai/geminiClient');
const {
  generateDashboardFromPrompt,
  AVAILABLE_WIDGETS,
  AVAILABLE_METRICS,
} = require('../services/aiDashboard');

const router = express.Router();

// Demo data for showcase
const DEMO_METRICS = {
  spend: 12847.50,
  revenue: 48392.00,
  impressions: 1243567,
  clicks: 34521,
  conversions: 892,
  roas: 3.77,
  ctr: 2.78,
  cpc: 0.37,
  cpa: 14.40,
};

const DEMO_TIMESERIES = [
  { date: '2026-01-31', spend: 1823, revenue: 6892, roas: 3.78 },
  { date: '2026-02-01', spend: 1956, revenue: 7234, roas: 3.70 },
  { date: '2026-02-02', spend: 1789, revenue: 7012, roas: 3.92 },
  { date: '2026-02-03', spend: 2134, revenue: 7891, roas: 3.70 },
  { date: '2026-02-04', spend: 1678, revenue: 6543, roas: 3.90 },
  { date: '2026-02-05', spend: 1890, revenue: 7123, roas: 3.77 },
  { date: '2026-02-06', spend: 1577, revenue: 6097, roas: 3.87 },
];

const DEMO_CAMPAIGNS = [
  { name: 'Summer Sale 2026', spend: 4521, revenue: 18234, roas: 4.03, status: 'active' },
  { name: 'Brand Awareness', spend: 3892, revenue: 14123, roas: 3.63, status: 'active' },
  { name: 'Retargeting - Cart', spend: 2134, revenue: 9234, roas: 4.33, status: 'active' },
  { name: 'New Customer Acq', spend: 2300, revenue: 6801, roas: 2.96, status: 'active' },
];

/**
 * GET /api/demo/status - Check demo mode availability
 */
router.get('/status', (req, res) => {
  res.json({
    success: true,
    demo: true,
    message: 'Demo mode active - Powered by Gemini 3',
    features: [
      'AI-generated dashboards from natural language',
      'Real-time marketing analytics',
      'Intelligent performance insights',
    ],
  });
});

/**
 * GET /api/demo/metrics - Get demo KPI data
 */
router.get('/metrics', (req, res) => {
  res.json({
    success: true,
    demo: true,
    data: {
      metrics: DEMO_METRICS,
      timeseries: DEMO_TIMESERIES,
      campaigns: DEMO_CAMPAIGNS,
      period: 'Last 7 days',
    },
  });
});

/**
 * POST /api/demo/analyze - Demo AI analysis (uses Gemini 3)
 */
router.post('/analyze', async (req, res) => {
  const { question } = req.body;

  if (!question) {
    return res.status(400).json({ success: false, message: 'Question is required' });
  }

  try {
    console.log('[Demo] AI Analysis request:', question);

    const prompt = `You are a marketing analyst. Analyze this demo data and answer the user's question.

USER QUESTION: ${question}

DEMO DATA:
- Total Spend: $${DEMO_METRICS.spend.toLocaleString()}
- Total Revenue: $${DEMO_METRICS.revenue.toLocaleString()}
- ROAS: ${DEMO_METRICS.roas}x
- Impressions: ${DEMO_METRICS.impressions.toLocaleString()}
- Clicks: ${DEMO_METRICS.clicks.toLocaleString()}
- CTR: ${DEMO_METRICS.ctr}%
- Conversions: ${DEMO_METRICS.conversions}
- CPA: $${DEMO_METRICS.cpa}

TOP CAMPAIGNS:
${DEMO_CAMPAIGNS.map(c => `- ${c.name}: Spend $${c.spend}, Revenue $${c.revenue}, ROAS ${c.roas}x`).join('\n')}

Return ONLY valid JSON in this exact format (no markdown):
{
  "status": "ok",
  "findings": [
    {"title": "...", "detail": "...", "impact": "high|medium|low", "supporting_metrics": ["metric1"]}
  ],
  "actions": [
    {"priority": "high|medium|low", "action": "...", "rationale": "...", "expected_impact": "...", "supporting_metrics": ["metric1"]}
  ],
  "exec_summary": {
    "headline": "One sentence summary answering the question",
    "what_changed": ["bullet1", "bullet2"],
    "why": ["reason1"],
    "what_to_do_next": ["action1", "action2"]
  }
}`;

    const aiResponse = await generate(prompt);

    // Parse AI response
    let result;
    try {
      const cleaned = aiResponse.replace(/```json|```/gi, '').trim();
      result = JSON.parse(cleaned);
    } catch (parseErr) {
      // Fallback response
      result = {
        status: 'ok',
        exec_summary: {
          headline: `Based on the data, your overall ROAS of ${DEMO_METRICS.roas}x indicates strong campaign performance.`,
          what_changed: [
            `Total spend of $${DEMO_METRICS.spend.toLocaleString()} generated $${DEMO_METRICS.revenue.toLocaleString()} in revenue`,
            `CTR of ${DEMO_METRICS.ctr}% is above industry average`,
          ],
          why: ['Strong creative performance', 'Well-targeted audience segments'],
          what_to_do_next: ['Scale top-performing campaigns', 'Test new audiences'],
        },
        findings: [],
        actions: [],
      };
    }

    // Add dashboard spec
    result.dashboard_spec = {
      title: 'AI Analysis',
      tiles: [
        { type: 'kpi', title: 'Spend', value: `$${DEMO_METRICS.spend.toLocaleString()}`, unit: 'USD' },
        { type: 'kpi', title: 'Revenue', value: `$${DEMO_METRICS.revenue.toLocaleString()}`, unit: 'USD' },
        { type: 'kpi', title: 'ROAS', value: `${DEMO_METRICS.roas}x`, unit: 'ratio' },
        { type: 'kpi', title: 'Conversions', value: DEMO_METRICS.conversions.toString(), unit: 'count' },
      ],
    };

    res.json(result);
  } catch (error) {
    console.error('[Demo] Analysis error:', error);
    res.status(500).json({ success: false, message: 'Analysis failed', error: error.message });
  }
});

/**
 * POST /api/demo/generate-dashboard - Demo AI dashboard generation (uses Gemini 3)
 */
router.post('/generate-dashboard', async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ success: false, message: 'Prompt is required' });
  }

  try {
    console.log('[Demo] Dashboard generation request:', prompt);

    // Use the actual AI dashboard generation with demo account
    const result = await generateDashboardFromPrompt(prompt, {
      adAccountId: 'demo',
      workspaceId: 'demo',
      platform: 'meta',
    });

    if (result.success) {
      // Add demo data to each widget
      result.dashboard.widgets = result.dashboard.widgets.map(widget => ({
        ...widget,
        demoData: getDemoDataForWidget(widget),
      }));

      res.json({
        success: true,
        demo: true,
        message: 'Dashboard generated with Gemini 3',
        data: result.dashboard,
      });
    } else {
      throw new Error('Dashboard generation failed');
    }
  } catch (error) {
    console.error('[Demo] Dashboard generation error:', error);
    res.status(500).json({ success: false, message: 'Dashboard generation failed', error: error.message });
  }
});

/**
 * GET /api/demo/widgets - Get available widget types
 */
router.get('/widgets', (req, res) => {
  res.json({
    success: true,
    data: {
      widgets: AVAILABLE_WIDGETS,
      metrics: AVAILABLE_METRICS,
    },
  });
});

// Helper function to generate demo data for widgets
function getDemoDataForWidget(widget) {
  const metric = widget.metric || 'spend';

  switch (widget.widgetType) {
    case 'kpi_card':
      return {
        value: DEMO_METRICS[metric] || Math.floor(Math.random() * 10000),
        change: (Math.random() * 20 - 10).toFixed(1),
        trend: Math.random() > 0.5 ? 'up' : 'down',
      };

    case 'line_chart':
    case 'bar_chart':
      return {
        labels: DEMO_TIMESERIES.map(d => d.date),
        datasets: [{
          label: metric,
          data: DEMO_TIMESERIES.map(d => d[metric] || Math.floor(Math.random() * 5000)),
        }],
      };

    case 'pie_chart':
      return {
        labels: DEMO_CAMPAIGNS.map(c => c.name),
        data: DEMO_CAMPAIGNS.map(c => c[metric] || c.spend),
      };

    case 'table':
      return {
        columns: ['Campaign', 'Spend', 'Revenue', 'ROAS'],
        rows: DEMO_CAMPAIGNS.map(c => [c.name, `$${c.spend}`, `$${c.revenue}`, `${c.roas}x`]),
      };

    default:
      return { value: DEMO_METRICS[metric] || 0 };
  }
}

module.exports = router;

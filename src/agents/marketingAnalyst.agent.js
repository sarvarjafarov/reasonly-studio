const {
  get_kpis,
  compare_periods,
  get_timeseries,
  detect_anomalies,
} = require('../tools/analyticsTools');
const {
  getRealKPIs,
  comparePeriods: compareRealPeriods,
  getTimeSeries: getRealTimeSeries,
} = require('../tools/realDataLoader');
const { generate } = require('../ai/geminiClient');
const config = require('../config/config');
const { enforceEvidenceBinding } = require('./finalResponse.validator');

function validateScopeInput(scope) {
  if (!scope) return 'Scope is required. Select an analytics account or custom data source.';
  if (!scope.source) return 'Scope source is required.';
  if (scope.source === 'meta_ads' && !scope.accountId) return 'Select a Meta Ads account.';
  if (scope.source === 'search_console' && !scope.propertyUrl) return 'Select a Search Console property.';
  if (scope.source === 'custom_data' && !scope.accountId) return 'Select a custom data source.';
  return null;
}

function describeScope(scope) {
  if (!scope) return '';
  const segments = [];
  if (scope.source === 'meta_ads') {
    segments.push(`Meta Ads account ${scope.accountId || 'unspecified'}`);
  } else if (scope.source === 'search_console') {
    segments.push(`Search Console property ${scope.propertyUrl || 'unspecified'}`);
  } else if (scope.source === 'custom_data') {
    segments.push(`Custom data ${scope.accountId || 'source'}`);
  } else {
    segments.push(`${scope.source}`);
  }
  if (scope.entityLevel) {
    segments.push(`level ${scope.entityLevel}`);
  }
  return segments.join(' • ');
}

function createScopeErrorResponse(question, reason) {
  return {
    status: 'insufficient_data',
    objective: question,
    findings: [],
    actions: [],
    evidence: [],
    dashboard_spec: {},
    exec_summary: {
      headline: 'Insufficient data: scope missing',
      what_changed: [],
      why: [reason],
      what_to_do_next: [
        'Select a connected analytics account',
        'Connect the required platform (Meta / Search Console)',
        'Upload or choose a custom data source if needed',
      ],
    },
  };
}

function buildScopeFilters(scope) {
  if (!scope) return {};
  const filters = { source: scope.source };
  if (scope.accountId) filters.accountId = scope.accountId;
  if (scope.propertyUrl) filters.propertyUrl = scope.propertyUrl;
  return filters;
}

function deterministicSummary(kpis, comparisons, series, anomalies, question, scopeDescription = '') {
  const findings = [];
  findings.push({
    title: 'Core KPI snapshot',
    detail: `Spend $${kpis.metrics.spend.toFixed(0)}, revenue $${kpis.metrics.revenue.toFixed(
      0
    )}, ROAS ${(kpis.metrics.roas || 0).toFixed(2)}x over the selected range.`,
    impact: 'Baseline performance',
    supporting_metrics: ['spend', 'revenue', 'roas'],
  });

  findings.push({
    title: 'Comparative view',
    detail: `Compared to the prior window, spend changed by $${(
      comparisons.metrics.current.spend - comparisons.metrics.previous.spend
    ).toFixed(0)} and revenue by $${(comparisons.metrics.current.revenue - comparisons.metrics.previous.revenue).toFixed(0)}.`,
    impact: 'Trend insight',
    supporting_metrics: ['spend', 'revenue'],
  });

  const actions = [
    {
      priority: 'high',
      action: 'Increase focus on top contributing campaign',
      rationale: 'It drives the majority of spend/revenue',
      expected_impact: 'Maintain ROAS while scaling conversions',
      risk: 'Overexposure on single channel',
      how_to_validate: 'Track ROAS/conversion change next week',
      supporting_metrics: ['spend', 'revenue'],
    },
  ];

  const dashboard_spec = {
    title: 'Auto-generated summary',
    tiles: [
      { type: 'kpi', title: 'Spend', value: `$${kpis.metrics.spend.toFixed(0)}`, unit: 'USD' },
      { type: 'kpi', title: 'Revenue', value: `$${kpis.metrics.revenue.toFixed(0)}`, unit: 'USD' },
      { type: 'kpi', title: 'ROAS', value: `${(kpis.metrics.roas || 0).toFixed(2)}x`, unit: 'ratio' },
      {
        type: 'trend',
        title: 'Spend vs Revenue',
        series: [
          { name: 'Spend', data: series.data.map((point) => ({ x: point.date, y: point.spend })) },
          { name: 'Revenue', data: series.data.map((point) => ({ x: point.date, y: point.revenue })) },
        ],
      },
    ],
  };

  const exec_summary = {
    headline: 'Deterministic summary generated',
    what_changed: ['KPI snapshot created', 'Comparative spend vs revenue'],
    why: ['Need to understand performance trends'],
    what_to_do_next: ['Review top campaigns', 'Monitor ROAS metrics'],
  };

  const evidence = [
    {
      id: 'deterministic-kpi',
      tool: 'get_kpis',
      params_summary: 'sample data',
      key_results: [
        `metric=spend value=${kpis.metrics.spend.toFixed(0)}`,
        `metric=revenue value=${kpis.metrics.revenue.toFixed(0)}`,
      ],
    },
  ];

  const objective = scopeDescription ? `${scopeDescription} · ${question}` : question;
  const finalResponse = {
    status: 'ok',
    objective,
    findings,
    actions,
    evidence,
    dashboard_spec,
    exec_summary,
  };

  enforceEvidenceBinding(finalResponse);
  return finalResponse;
}

async function runAgent(input) {
  const { workspaceId, question, dateRange, primaryKpi = 'roas', scope } = input;
  const scopeError = validateScopeInput(scope);
  if (scopeError) {
    return createScopeErrorResponse(question, scopeError);
  }
  const filters = buildScopeFilters(scope);
  const scopeDescription = describeScope(scope);
  const kpis = await get_kpis(workspaceId, dateRange, filters, null, ['spend', 'revenue', 'conversions', 'roas']);
  const previousRange = {
    start: new Date(new Date(dateRange.start).setDate(new Date(dateRange.start).getDate() - 7)).toISOString().split('T')[0],
    end: new Date(new Date(dateRange.end).setDate(new Date(dateRange.end).getDate() - 7)).toISOString().split('T')[0],
  };
  const comparisons = await compare_periods(workspaceId, dateRange, previousRange, ['spend', 'revenue', 'conversions']);
  const series = await get_timeseries(workspaceId, dateRange, 'daily', ['spend', 'revenue'], null, filters);
  const anomalies = await detect_anomalies(workspaceId, dateRange, primaryKpi);
  return deterministicSummary(kpis, comparisons, series, anomalies, question, scopeDescription);
}

async function runGeminiAgent(input, options = {}) {
  if (!config.useGemini) throw new Error('Gemini disabled');
  const debugMode = options.debug === true;
  const scopeError = validateScopeInput(input.scope);
  if (scopeError) {
    return createScopeErrorResponse(input.question, scopeError);
  }

  const { workspaceId, question, dateRange, primaryKpi = 'roas', scope } = input;
  const scopeDescription = describeScope(scope);
  const filters = buildScopeFilters(scope);

  // Calculate previous period for comparison
  const daysDiff = Math.ceil((new Date(dateRange.end) - new Date(dateRange.start)) / (1000 * 60 * 60 * 24));
  const prevEnd = new Date(dateRange.start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - daysDiff);
  const previousRange = {
    start: prevStart.toISOString().split('T')[0],
    end: prevEnd.toISOString().split('T')[0],
  };

  // Step 1: Gather REAL data from Meta Ads API (not sample data)
  let kpis, comparisons, series;

  if (scope.source === 'meta_ads' && scope.accountId) {
    // Use real Meta Ads API data
    console.log(`[AI Agent] Fetching real Meta Ads data for account ${scope.accountId}`);
    [kpis, comparisons, series] = await Promise.all([
      getRealKPIs(workspaceId, dateRange, filters),
      compareRealPeriods(workspaceId, dateRange, previousRange, filters),
      getRealTimeSeries(workspaceId, dateRange, filters),
    ]);
  } else {
    // Fallback to sample data for other sources
    console.log('[AI Agent] Using sample data (non-Meta source)');
    [kpis, comparisons, series] = await Promise.all([
      get_kpis(workspaceId, dateRange, filters, null, ['spend', 'revenue', 'conversions', 'roas', 'cpa', 'ctr', 'impressions', 'clicks']),
      compare_periods(workspaceId, dateRange, previousRange, ['spend', 'revenue', 'conversions', 'roas', 'cpa']),
      get_timeseries(workspaceId, dateRange, 'daily', ['spend', 'revenue', 'roas'], null, filters),
    ]);
  }

  // Anomaly detection (keep using sample for now)
  const anomalies = await detect_anomalies(workspaceId, dateRange, primaryKpi);

  // Build evidence from gathered data
  const evidence = [
    {
      id: 'ev_kpis',
      tool: 'get_kpis',
      params_summary: `${scopeDescription} · ${dateRange.start} to ${dateRange.end}`,
      key_results: Object.entries(kpis.metrics || {}).map(([k, v]) => `${k}=${typeof v === 'number' ? v.toFixed(2) : v}`).slice(0, 6),
    },
    {
      id: 'ev_comparison',
      tool: 'compare_periods',
      params_summary: 'Current vs previous 7 days',
      key_results: [
        `spend_change=${((comparisons.metrics?.current?.spend || 0) - (comparisons.metrics?.previous?.spend || 0)).toFixed(0)}`,
        `revenue_change=${((comparisons.metrics?.current?.revenue || 0) - (comparisons.metrics?.previous?.revenue || 0)).toFixed(0)}`,
        `roas_current=${(comparisons.metrics?.current?.roas || 0).toFixed(2)}`,
        `roas_previous=${(comparisons.metrics?.previous?.roas || 0).toFixed(2)}`,
      ],
    },
  ];

  if (anomalies.anomalies?.length > 0) {
    evidence.push({
      id: 'ev_anomalies',
      tool: 'detect_anomalies',
      params_summary: `${primaryKpi} anomaly detection`,
      key_results: anomalies.anomalies.slice(0, 3).map(a => `${a.date}: ${a.type} (${a.metric}=${a.value})`),
    });
  }

  // Step 2: Single Gemini call to analyze and generate insights
  const analysisPrompt = `You are a marketing analyst. Analyze this data and answer the user's question.

USER QUESTION: ${question}
SCOPE: ${scopeDescription}
DATE RANGE: ${dateRange.start} to ${dateRange.end}

DATA:
- KPIs: ${JSON.stringify(kpis.metrics)}
- Period Comparison: Current=${JSON.stringify(comparisons.metrics?.current)}, Previous=${JSON.stringify(comparisons.metrics?.previous)}
- Anomalies: ${JSON.stringify(anomalies.anomalies?.slice(0, 5) || [])}
- Timeseries points: ${series.data?.length || 0} days

Return ONLY valid JSON in this exact format (no markdown, no explanation):
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

  const trace = {
    plan_steps: ['gather_data', 'analyze_with_ai'],
    tool_calls: evidence.map(e => ({ name: e.tool, args_summary: e.params_summary, result_summary: e.key_results.join(', ') })),
    validation: [],
  };

  try {
    const aiResponse = await generate(analysisPrompt);
    let finalResponse = safeParseJson(aiResponse, 'AI analysis');

    // Add required fields
    finalResponse.objective = scopeDescription ? `${scopeDescription} · ${question}` : question;
    finalResponse.evidence = evidence;
    finalResponse.dashboard_spec = {
      title: 'AI Analysis',
      tiles: [
        { type: 'kpi', title: 'Spend', value: `$${(kpis.metrics?.spend || 0).toFixed(0)}`, unit: 'USD' },
        { type: 'kpi', title: 'Revenue', value: `$${(kpis.metrics?.revenue || 0).toFixed(0)}`, unit: 'USD' },
        { type: 'kpi', title: 'ROAS', value: `${(kpis.metrics?.roas || 0).toFixed(2)}x`, unit: 'ratio' },
        {
          type: 'trend',
          title: 'Performance Trend',
          series: [
            { name: 'Spend', data: (series.data || []).map(p => ({ x: p.date, y: p.spend })) },
            { name: 'Revenue', data: (series.data || []).map(p => ({ x: p.date, y: p.revenue })) },
          ],
        },
      ],
    };

    trace.validation.push('ai_response_parsed');
    finalResponse = enforceEvidenceBinding(finalResponse);
    trace.validation.push('evidence_binding_enforced');

    return debugMode ? { result: finalResponse, trace } : finalResponse;
  } catch (err) {
    console.error('Gemini analysis failed:', err.message);
    trace.validation.push(`ai_failed: ${err.message}`);

    // Fallback to deterministic summary with AI-style formatting
    const fallback = deterministicSummary(kpis, comparisons, series, anomalies, question, scopeDescription);
    fallback.exec_summary.headline = `Analysis based on ${scopeDescription} data`;
    return debugMode ? { result: fallback, trace } : fallback;
  }
}

function safeParseJson(text, label) {
  const cleaned = text.replace(/```json|```/gi, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Failed to parse ${label}: ${err.message}`);
  }
}

module.exports = {
  runGeminiAgent,
  runAgent,
  createScopeErrorResponse,
  validateScopeInput,
};

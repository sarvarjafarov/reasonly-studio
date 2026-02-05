const {
  get_kpis,
  compare_periods,
  get_timeseries,
  detect_anomalies,
} = require('../tools/analyticsTools');
const { generate } = require('../ai/geminiClient');
const { tools, callTool } = require('../ai/geminiTools');
const { validateFinalResponse, enforceEvidenceBinding } = require('./finalResponse.validator');

const MAX_PLAN_STEPS = 7;
const MAX_TOOL_CALLS = 8;

function deterministicSummary(kpis, comparisons, series, anomalies, question) {
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

  const finalResponse = {
    status: 'ok',
    objective: question,
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
  const { workspaceId, question, dateRange, primaryKpi = 'roas' } = input;
  const kpis = await get_kpis(workspaceId, dateRange, {}, null, ['spend', 'revenue', 'conversions', 'roas']);
  const previousRange = {
    start: new Date(new Date(dateRange.start).setDate(new Date(dateRange.start).getDate() - 7)).toISOString().split('T')[0],
    end: new Date(new Date(dateRange.end).setDate(new Date(dateRange.end).getDate() - 7)).toISOString().split('T')[0],
  };
  const comparisons = await compare_periods(workspaceId, dateRange, previousRange, ['spend', 'revenue', 'conversions']);
  const series = await get_timeseries(workspaceId, dateRange, 'daily', ['spend', 'revenue']);
  const anomalies = await detect_anomalies(workspaceId, dateRange, primaryKpi);
  return deterministicSummary(kpis, comparisons, series, anomalies, question);
}

async function runGeminiAgent(input, options = {}) {
  if (!config.useGemini) throw new Error('Gemini disabled');
  const debugMode = options.debug === true;

  const planPrompt = `
You are an autonomous marketing analyst. Respond with JSON ONLY: {"plan":["step1","step2",...]}.
Max 7 steps. No markdown, no explanations outside JSON.
`;

  const planText = await generate(`${planPrompt}\nQuestion:${input.question}\nWorkspace:${input.workspaceId}\nDateRange:${input.dateRange.start}-${input.dateRange.end}`);
  const planJson = safeParseJson(planText, 'plan');
  const plan = Array.isArray(planJson.plan) ? planJson.plan.slice(0, MAX_PLAN_STEPS) : [];

  const evidence = [];
  const trace = {
    plan_steps: plan,
    tool_calls: [],
    validation: [],
  };

  const toolResults = [];

  for (let i = 0; i < MAX_TOOL_CALLS; i++) {
    const toolLoopPrompt = `
Plan: ${JSON.stringify(plan)}
Evidence so far: ${JSON.stringify(evidence)}
Tool summaries: ${JSON.stringify(toolResults.map((r) => ({ name: r.name, summary: summarizeResult(r.result) })))}
Return JSON: {"next":{"name":"...","arguments":{...}},"done":false,"reason":"..."}.
`;

    if (i > 0 && toolResults.length >= 2) {
      toolLoopPrompt.concat('\nYou may return done=true if enough evidence.');
    }

    const toolText = await generate(toolLoopPrompt);
    const toolJson = safeParseJson(toolText, 'tool call');
    const next = toolJson.next;
    if (!next || toolJson.done) break;
    if (!tools.some((tool) => tool.name === next.name)) {
      trace.tool_calls.push({
        name: next.name,
        args_summary: JSON.stringify(next.arguments || {}),
        result_summary: 'unknown tool (skipped)',
      });
      continue;
    }

    const toolResult = await callTool(next.name, next.arguments || {});
    toolResults.push({ name: next.name, args: next.arguments || {}, result: toolResult });
    trace.tool_calls.push({
      name: next.name,
      args_summary: JSON.stringify(next.arguments || {}),
      result_summary: summarizeResult(toolResult),
    });

    evidence.push({
      id: `ev_${evidence.length + 1}`,
      tool: next.name,
      params_summary: JSON.stringify(next.arguments || {}),
      key_results: extractKeyResults(toolResult),
    });
    if (toolResults.length >= 2 && toolJson.done) break;
  }

  const finalPrompt = `
Plan: ${JSON.stringify(plan)}
Evidence: ${JSON.stringify(evidence)}
Tool summaries: ${JSON.stringify(toolResults.map((r) => ({ name: r.name, summary: summarizeResult(r.result) })))}
Now return FinalResponse JSON ONLY.
`;

  let finalResponse = await safeParseJson(await generate(finalPrompt), 'final response');
  try {
    validateFinalResponse(finalResponse);
    trace.validation.push('validation ok');
  } catch (err) {
    trace.validation.push(`validation failed: ${err.message}`);
    const repairPrompt = `
Validation errors: ${err.message}
Evidence: ${JSON.stringify(evidence)}
Return corrected FinalResponse JSON ONLY.
`;

    finalResponse = await safeParseJson(await generate(repairPrompt), 'repair response');
    validateFinalResponse(finalResponse);
    trace.validation.push('repair ok');
  }

  finalResponse = enforceEvidenceBinding(finalResponse);
  trace.validation.push('evidence binding enforced');

  return debugMode ? { result: finalResponse, trace } : finalResponse;
}

function safeParseJson(text, label) {
  const cleaned = text.replace(/```json|```/gi, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Failed to parse ${label}: ${err.message}`);
  }
}

function summarizeResult(result) {
  if (!result || typeof result !== 'object') return 'empty';
  const keys = Object.keys(result).slice(0, 3);
  return keys.map((k) => `${k}:${JSON.stringify(result[k])}`).join(', ') || 'empty';
}

function extractKeyResults(toolResult) {
  if (!toolResult || typeof toolResult !== 'object') return [];
  const metrics = toolResult.metrics || toolResult;
  return Object.entries(metrics || {})
    .map(([key, value]) => `metric=${key} value=${value}`)
    .slice(0, 4);
}

module.exports = {
  runGeminiAgent,
  runAgent,
};

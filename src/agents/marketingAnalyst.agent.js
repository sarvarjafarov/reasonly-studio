const {
  get_kpis,
  compare_periods,
  get_timeseries,
  detect_anomalies,
} = require('../tools/analyticsTools');
const finalResponseSchema = require('./schemas/finalResponse.schema.json');
const config = require('../config/config');
const { generate } = require('../ai/geminiClient');
const { tools, callTool } = require('../ai/geminiTools');

const defaultMetrics = ['spend', 'revenue', 'conversions', 'roas'];

function buildPlan(question, primaryKpi, dateRange) {
  return [
    `Clarify objective: ${question}`,
    `Fetch KPIs for ${primaryKpi} between ${dateRange.start} and ${dateRange.end}`,
    'Compare latest range to the previous window',
    'Capture trend data and anomalies',
    'Compose findings, actions, dashboard tiles, and executive summary',
  ];
}

function buildDashboardSpec(kpis, series, comparisons) {
  return {
    title: 'Autonomous Marketing Analyst',
    tiles: [
      { type: 'kpi', title: 'Total Spend', value: `$${kpis.metrics.spend.toFixed(0)}`, unit: 'USD' },
      { type: 'kpi', title: 'Revenue', value: `$${kpis.metrics.revenue.toFixed(0)}`, unit: 'USD' },
      { type: 'kpi', title: 'Conversions', value: `${kpis.metrics.conversions}`, unit: 'events' },
      { type: 'kpi', title: 'ROAS', value: `${(kpis.metrics.roas || 0).toFixed(2)}x`, unit: 'ratio' },
      {
        type: 'trend',
        title: 'Spend & Revenue Trend',
        series: [
          { name: 'Spend', data: series.data.map(item => ({ x: item.date, y: Number(item.spend.toFixed(2)) })) },
          { name: 'Revenue', data: series.data.map(item => ({ x: item.date, y: Number(item.revenue.toFixed(2)) })) },
        ],
      },
      {
        type: 'contribution',
        title: 'Top Campaigns (by spend)',
        data: comparisons.contributions.map(entry => ({
          label: `${entry.campaign} / ${entry.platform}`,
          value: entry.spendContribution,
        })),
      },
      {
        type: 'table',
        title: 'Top Concurrent Campaigns',
        columns: ['Campaign', 'Spend', 'Revenue', 'Conversions'],
        rows: comparisons.contributions.map(entry => [
          `${entry.campaign} (${entry.platform})`,
          `$${entry.spendContribution.toFixed(2)}`,
          `$${entry.revenueContribution.toFixed(2)}`,
          `${entry.conversions || 0}`,
        ]),
      },
    ],
  };
}

function synthesizeFindings(kpis, comparisons, anomalies, primaryKpi) {
  const findings = [];

  findings.push({
    title: 'Core KPIs',
    detail: `During ${kpis.dateRange.start} to ${kpis.dateRange.end}, spend was $${kpis.metrics.spend.toFixed(0)} and revenue totaled $${kpis.metrics.revenue.toFixed(0)}, delivering ${kpis.metrics.roas.toFixed(2)}x ROAS.`,
    impact: 'Validates budget efficiency for the current sprint',
    supporting_metrics: [
      `Spend: $${kpis.metrics.spend.toFixed(0)}`,
      `Revenue: $${kpis.metrics.revenue.toFixed(0)}`,
      `ROAS: ${kpis.metrics.roas.toFixed(2)}x`,
    ],
  });

  findings.push({
    title: 'Comparative Performance',
    detail: `Compared to the prior window, spend changed by $${(comparisons.metrics.current.spend - comparisons.metrics.previous.spend).toFixed(0)} and revenue changed by $${(comparisons.metrics.current.revenue - comparisons.metrics.previous.revenue).toFixed(0)}.`,
    impact: 'Shows whether performance is accelerating or cooling',
    supporting_metrics: [
      `Current spend: $${comparisons.metrics.current.spend.toFixed(0)}`,
      `Prior spend: $${comparisons.metrics.previous.spend.toFixed(0)}`,
      `Current revenue: $${comparisons.metrics.current.revenue.toFixed(0)}`,
    ],
  });

  if (anomalies.anomalies.length) {
    findings.push({
      title: 'Potential Anomalies',
      detail: `Detected ${anomalies.anomalies.length} spikes in ${primaryKpi}, the largest on ${anomalies.anomalies[0].date} (${anomalies.anomalies[0].value}).`,
      impact: 'Signals irregular performance worth validating',
      supporting_metrics: anomalies.anomalies.map(anomaly => `${anomaly.metric} ${anomaly.value} on ${anomaly.date}`),
    });
  }

  return findings;
}

function craftActions(primaryKpi, comparisons) {
  const actions = [
    {
      priority: 'high',
      action: `Shift more budget to the highest contributing campaign (${comparisons.contributions[0]?.campaign || 'N/A'})`,
      rationale: 'It already drives the largest spend and revenue lift',
      expected_impact: 'Lift revenue while keeping ROAS steady',
      risk: 'Recent big spends may have diminishing returns',
      how_to_validate: 'Track ROAS and conversion volume over the next 7 days',
    },
    {
      priority: 'medium',
      action: `Run a quality check on the ${primaryKpi} spike dates to confirm data integrity`,
      rationale: 'Anomalies could skew conclusions if they are data issues',
      expected_impact: 'Confidence in KPI storytelling',
      risk: 'Adds a short delay to reporting cadence',
      how_to_validate: 'Verify that spend and conversions line up in ad platform reports for those dates',
    },
  ];

  return actions;
}

function summarizeExec(changes, why, next) {
  return {
    headline: 'Automated analyst assistant completed the review',
    what_changed: changes,
    why,
    what_to_do_next: next,
  };
}

async function runAgent(input) {
  const {
    workspaceId,
    question,
    dateRange,
    compareMode = 'previous_period',
    primaryKpi = 'roas',
  } = input;

  const plan = buildPlan(question, primaryKpi, dateRange);

  const kpis = await get_kpis(workspaceId, dateRange, {}, null, [...defaultMetrics]);
  const previousRange = {
    start: new Date(new Date(dateRange.start).setDate(new Date(dateRange.start).getDate() - 7)).toISOString().split('T')[0],
    end: new Date(new Date(dateRange.end).setDate(new Date(dateRange.end).getDate() - 7)).toISOString().split('T')[0],
  };
  const comparisons = await compare_periods(workspaceId, dateRange, previousRange, ['spend', 'revenue', 'conversions']);
  const series = await get_timeseries(workspaceId, dateRange, 'daily', ['spend', 'revenue'], null, {});
  const anomalies = await detect_anomalies(workspaceId, dateRange, primaryKpi, 'daily', null, 1.2);

  const evidence = [
    {
      id: 'kpi-1',
      tool: 'get_kpis',
      params_summary: `workspace=${workspaceId}, question=${question}`,
      key_results: [`${kpis.metrics.revenue.toFixed(0)} revenue this period`, `${kpis.metrics.spend.toFixed(0)} spend`],
    },
    {
      id: 'comparison-1',
      tool: 'compare_periods',
      params_summary: 'default previous week comparison',
      key_results: [`spend delta ${(comparisons.metrics.current.spend - comparisons.metrics.previous.spend).toFixed(0)}`],
    },
    {
      id: 'timeseries-1',
      tool: 'get_timeseries',
      params_summary: 'daily trend for spend & revenue',
      key_results: [`${series.data.length} data points`],
    },
    {
      id: 'anomaly-1',
      tool: 'detect_anomalies',
      params_summary: `${primaryKpi} sensitivity 1.2`,
      key_results: anomalies.anomalies.map(a => `${a.metric} ${a.value} on ${a.date}`),
    },
  ];

  const findings = synthesizeFindings(kpis, comparisons, anomalies, primaryKpi);
  const actions = craftActions(primaryKpi, comparisons);
  const dashboard_spec = buildDashboardSpec(kpis, series, comparisons);
  const exec_summary = summarizeExec(
    ['Computed current KPIs and trends', 'Identified top campaign contributors'],
    ['Need to confirm anomaly dates for data quality', 'Budget allocation should follow strongest contributors'],
    ['Approve high-impact campaigns', 'Monitor ROAS daily for the next week']
  );

  // TODO: Replace deterministic logic with Gemini plan/response step.

  return {
    status: 'ok',
    objective: question,
    findings,
    actions,
    evidence,
    dashboard_spec,
    exec_summary,
  };
}

function validateFinalResponse(response) {
  const requiredKeys = ['status', 'objective', 'findings', 'actions', 'evidence', 'dashboard_spec', 'exec_summary'];
  for (const key of requiredKeys) {
    if (!(key in response)) {
      return false;
    }
  }
  if (!Array.isArray(response.findings) || !Array.isArray(response.actions)) {
    return false;
  }
  if (response.status === 'ok' && (!Array.isArray(response.evidence) || response.evidence.length === 0)) {
    return false;
  }
  return true;
}

async function runGeminiAgent(input) {
  if (!config.useGemini) {
    throw new Error('Gemini not enabled');
  }

  const planPrompt = `
You are an autonomous marketing analyst. Plan how you will answer the question by providing a JSON object:
{
  "plan": [
    {"id": "step1", "title": "...", "summary": "...", "tool_required": true},
    ...
  ],
  "tool_call": {"name": "<tool_name>", "arguments": {...}}
}
Never invent numbers. Always plan, then use a tool to fetch data.
`.trim();

  const planText = await generate(`${planPrompt}\n\nQuestion: ${input.question}\nWorkspace: ${input.workspaceId}\nDate range: ${input.dateRange.start} to ${input.dateRange.end}\nPrimary KPI: ${input.primaryKpi || 'roas'}`);
  let planJson;
  try {
    planJson = JSON.parse(planText);
  } catch (err) {
    console.error('Gemini plan output invalid JSON', err);
    throw new Error('Gemini plan output invalid');
  }

  const planSteps = Array.isArray(planJson.plan) ? planJson.plan : [];
  const toolCall = planJson.tool_call;

  if (!toolCall || !toolCall.name) {
    throw new Error('Gemini did not provide a tool call');
  }

  console.log('Gemini plan:', planSteps.map(step => `${step.id}: ${step.title}`).join(' | '));
  console.log('Gemini tool call:', toolCall.name, toolCall.arguments);

  const toolResult = await callTool(toolCall.name, toolCall.arguments || {});
  console.log('Tool result received from', toolCall.name);

  const finalPrompt = `
Plan: ${JSON.stringify(planSteps)}

Tool result (${toolCall.name}): ${JSON.stringify(toolResult)}

Now respond with the FinalResponse JSON (status, objective, findings, actions, evidence, dashboard_spec, exec_summary).
Ensure every finding/action references the tool result above. Include evidence entries that cite the tool.
`;

  const finalText = await generate(finalPrompt);
  let parsed;
  try {
    parsed = JSON.parse(finalText);
  } catch (err) {
    console.error('Gemini final response invalid JSON', err);
    throw new Error('Gemini output invalid');
  }

  if (!validateFinalResponse(parsed)) {
    throw new Error('Gemini output failed validation');
  }

  const evidenceEntry = {
    id: `${toolCall.name}-1`,
    tool: toolCall.name,
    params_summary: JSON.stringify(toolCall.arguments || {}),
    key_results: Object.entries(toolResult.metrics || toolResult || {}).map(
      ([key, value]) => `${key}: ${value}`
    ),
    trace: planSteps.map(step => step.title).join(' > '),
  };

  if (!Array.isArray(parsed.evidence)) {
    parsed.evidence = [];
  }
  parsed.evidence.push(evidenceEntry);

  console.log('Gemini FinalResponse valid with evidence');
  return parsed;
}

module.exports = {
  finalResponseSchema,
  runAgent,
  runGeminiAgent,
};

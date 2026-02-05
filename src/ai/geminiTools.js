const {
  get_kpis,
  compare_periods,
  get_timeseries,
  detect_anomalies,
} = require('../tools/analyticsTools');

const tools = [
  {
    name: 'get_kpis',
    description: 'Retrieve core KPI aggregates for a workspace over a date range',
    parameters: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string' },
        dateRange: {
          type: 'object',
          properties: {
            start: { type: 'string', format: 'date' },
            end: { type: 'string', format: 'date' },
          },
          required: ['start', 'end'],
        },
        metrics: {
          type: 'array',
          items: { type: 'string' },
          default: ['spend', 'revenue', 'conversions'],
        },
      },
      required: ['workspaceId', 'dateRange'],
    },
  },
  {
    name: 'compare_periods',
    description: 'Compare metrics between two date ranges',
    parameters: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string' },
        currentRange: {
          type: 'object',
          properties: {
            start: { type: 'string', format: 'date' },
            end: { type: 'string', format: 'date' },
          },
          required: ['start', 'end'],
        },
        previousRange: {
          type: 'object',
          properties: {
            start: { type: 'string', format: 'date' },
            end: { type: 'string', format: 'date' },
          },
          required: ['start', 'end'],
        },
        metrics: {
          type: 'array',
          items: { type: 'string' },
          default: ['spend', 'revenue'],
        },
      },
      required: ['workspaceId', 'currentRange', 'previousRange'],
    },
  },
  {
    name: 'get_timeseries',
    description: 'Return daily time series for key metrics',
    parameters: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string' },
        dateRange: {
          type: 'object',
          properties: {
            start: { type: 'string', format: 'date' },
            end: { type: 'string', format: 'date' },
          },
          required: ['start', 'end'],
        },
      },
      required: ['workspaceId', 'dateRange'],
    },
  },
  {
    name: 'detect_anomalies',
    description: 'Find date-level anomalies for a metric',
    parameters: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string' },
        dateRange: {
          type: 'object',
          properties: {
            start: { type: 'string', format: 'date' },
            end: { type: 'string', format: 'date' },
          },
          required: ['start', 'end'],
        },
        metric: { type: 'string' },
        sensitivity: { type: 'number', default: 1.5 },
      },
      required: ['workspaceId', 'dateRange'],
    },
  },
];

async function callTool(name, params) {
  switch (name) {
    case 'get_kpis':
      return await get_kpis(params.workspaceId, params.dateRange, {}, null, params.metrics);
    case 'compare_periods':
      return await compare_periods(params.workspaceId, params.currentRange, params.previousRange, params.metrics);
    case 'get_timeseries':
      return await get_timeseries(params.workspaceId, params.dateRange);
    case 'detect_anomalies':
      return await detect_anomalies(params.workspaceId, params.dateRange, params.metric, 'daily', null, params.sensitivity);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

module.exports = {
  tools,
  callTool,
};

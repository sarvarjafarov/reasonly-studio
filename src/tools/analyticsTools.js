const { loadRows } = require('./sampleDataLoader');

const availableMetrics = ['spend', 'revenue', 'conversions', 'clicks', 'impressions', 'roas'];

function filterByWorkspace(rows, workspaceId) {
  return rows.filter(row => row.workspaceId === workspaceId);
}

function withinDateRange(rowDate, range) {
  const date = new Date(rowDate);
  const start = new Date(range.start);
  const end = new Date(range.end);
  return date >= start && date <= end;
}

function aggregate(rows, metrics) {
  const total = {};
  metrics.forEach(metric => {
    total[metric] = 0;
  });

  rows.forEach(row => {
    metrics.forEach(metric => {
      total[metric] += Number(row[metric] || 0);
    });
  });

  return total;
}

function getUniqueCampaigns(rows) {
  const map = new Map();
  rows.forEach(row => {
    const key = `${row.campaign}::${row.platform}`;
    if (!map.has(key)) {
      map.set(key, { campaign: row.campaign, platform: row.platform, spend: 0, revenue: 0, conversions: 0 });
    }
    const entry = map.get(key);
    entry.spend += row.spend;
    entry.revenue += row.revenue;
    entry.conversions += row.conversions;
  });
  return Array.from(map.values());
}

function formatTimeseries(rows, granularity = 'daily', metrics) {
  const grouped = {};
  rows.forEach(row => {
    const key = row.date;
    if (!grouped[key]) {
      grouped[key] = { date: row.date };
      metrics.forEach(metric => {
        grouped[key][metric] = 0;
      });
    }
    metrics.forEach(metric => {
      grouped[key][metric] += Number(row[metric] || 0);
    });
  });
  return Object.values(grouped).sort((a, b) => new Date(a.date) - new Date(b.date));
}

function computeAnomaly(rows, metric, sensitivity = 1.5) {
  if (!rows.length) {
    return [];
  }

  const values = rows.map(row => Number(row[metric] || 0));
  const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  const threshold = avg + sensitivity * stdDev;

  return rows
    .filter(row => Number(row[metric] || 0) > threshold)
    .map(row => ({
      date: row.date,
      campaign: row.campaign,
      metric,
      value: Number(row[metric] || 0),
      threshold: Number(threshold.toFixed(2)),
    }));
}

async function get_kpis(workspaceId, dateRange, filters = {}, groupBy = null, metrics = ['spend', 'revenue', 'conversions']) {
  const rows = loadRows();
  const filtered = filterByWorkspace(rows, workspaceId).filter(row => withinDateRange(row.date, dateRange));
  const aggregated = aggregate(filtered, metrics);
  aggregated.roas = aggregated.spend === 0 ? 0 : Number((aggregated.revenue / aggregated.spend).toFixed(2));

  const kpis = {
    workspaceId,
    dateRange,
    metrics: aggregated,
    rowCount: filtered.length,
    contribution: getUniqueCampaigns(filtered)
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 3),
  };

  return kpis;
}

async function compare_periods(workspaceId, currentRange, previousRange, metrics = ['spend', 'revenue'], contributionDimension = 'campaign') {
  const rows = loadRows();
  const currentRows = filterByWorkspace(rows, workspaceId).filter(row => withinDateRange(row.date, currentRange));
  const priorRows = filterByWorkspace(rows, workspaceId).filter(row => withinDateRange(row.date, previousRange));

  const current = aggregate(currentRows, metrics);
  const previous = aggregate(priorRows, metrics);

  const contributions = getUniqueCampaigns(currentRows)
    .sort((a, b) => b.spend - a.spend)
    .map(entry => ({
      campaign: entry.campaign,
      platform: entry.platform,
      spendContribution: Number(entry.spend.toFixed(2)),
      revenueContribution: Number(entry.revenue.toFixed(2)),
    }))
    .slice(0, 5);

  return {
    workspaceId,
    currentRange,
    previousRange,
    metrics: { current, previous },
    contributions,
  };
}

async function get_timeseries(workspaceId, dateRange, granularity = 'daily', metrics = ['spend', 'revenue'], groupBy = null, filters = {}) {
  const rows = loadRows();
  const filtered = filterByWorkspace(rows, workspaceId).filter(row => withinDateRange(row.date, dateRange));
  const series = formatTimeseries(filtered, granularity, metrics);
  series.forEach(point => {
    const spend = Number(point.spend || 0);
    const revenue = Number(point.revenue || 0);
    point.roas = spend === 0 ? 0 : Number((revenue / spend).toFixed(2));
  });

  return {
    workspaceId,
    dateRange,
    granularity,
    data: series,
  };
}

async function detect_anomalies(workspaceId, dateRange, metric = 'spend', granularity = 'daily', groupBy = null, sensitivity = 1.5) {
  const rows = loadRows();
  const filtered = filterByWorkspace(rows, workspaceId).filter(row => withinDateRange(row.date, dateRange));
  const anomalies = computeAnomaly(filtered, metric, sensitivity);

  return {
    workspaceId,
    dateRange,
    metric,
    anomalies,
    sensitivity,
  };
}

module.exports = {
  get_kpis,
  compare_periods,
  get_timeseries,
  detect_anomalies,
  availableMetrics,
};

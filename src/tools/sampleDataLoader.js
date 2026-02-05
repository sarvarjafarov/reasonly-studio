const fs = require('fs');
const path = require('path');

let cachedRows = null;

function parseValue(value, fallback = 0) {
  const num = Number(value);
  return Number.isNaN(num) ? fallback : num;
}

function loadRows() {
  if (cachedRows) {
    return cachedRows;
  }

  const filePath = path.join(__dirname, '../../data/sample.csv');
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.trim().split('\n');
  const headers = lines.shift().split(',').map(h => h.trim());

  cachedRows = lines.map(line => {
    const cells = line.split(',').map(cell => cell.trim());
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = cells[idx];
    });
    const spend = parseValue(row.spend);
    const revenue = parseValue(row.revenue);
    const conversions = parseValue(row.conversions);
    const clicks = parseValue(row.clicks);
    const impressions = parseValue(row.impressions);
    const roas = spend === 0 ? 0 : Number((revenue / spend).toFixed(2));
    return {
      workspaceId: row.workspace_id,
      date: row.date,
      campaign: row.campaign,
      platform: row.platform,
      spend,
      revenue,
      conversions,
      clicks,
      impressions,
      roas,
    };
  });

  return cachedRows;
}

module.exports = {
  loadRows,
};

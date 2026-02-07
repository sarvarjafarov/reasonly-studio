/**
 * Real Data Loader - Fetches actual data from Meta Ads API
 * Replaces sample CSV data with live platform data
 */

const { query } = require('../config/database');

/**
 * Fetch KPIs from Meta Ads API
 */
async function fetchMetaAdsKPIs(accountId, accessToken, since, until) {
  const baseUrl = 'https://graph.facebook.com/v18.0';

  try {
    const url = `${baseUrl}/act_${accountId}/insights?fields=spend,impressions,clicks,ctr,cpc,reach,actions,action_values,purchase_roas&time_range={"since":"${since}","until":"${until}"}&access_token=${accessToken}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      console.error('Meta API error:', data.error);
      return null;
    }

    if (!data.data || data.data.length === 0) {
      return {
        spend: 0,
        impressions: 0,
        clicks: 0,
        ctr: 0,
        cpc: 0,
        reach: 0,
        conversions: 0,
        revenue: 0,
        roas: 0,
        cpa: 0,
      };
    }

    const insights = data.data[0];

    // Calculate conversions from actions
    let conversions = 0;
    if (insights.actions) {
      const purchaseActions = insights.actions.filter(a =>
        a.action_type === 'purchase' ||
        a.action_type === 'omni_purchase' ||
        a.action_type === 'offsite_conversion.fb_pixel_purchase'
      );
      conversions = purchaseActions.reduce((sum, a) => sum + parseInt(a.value || 0), 0);

      // If no purchase conversions, count all conversions
      if (conversions === 0) {
        conversions = insights.actions.reduce((sum, a) => sum + parseInt(a.value || 0), 0);
      }
    }

    // Calculate revenue from action_values
    let revenue = 0;
    if (insights.action_values) {
      const purchaseValues = insights.action_values.filter(av =>
        av.action_type === 'purchase' ||
        av.action_type === 'omni_purchase' ||
        av.action_type === 'offsite_conversion.fb_pixel_purchase'
      );
      revenue = purchaseValues.reduce((sum, av) => sum + parseFloat(av.value || 0), 0);
    }

    const spend = parseFloat(insights.spend || 0);

    // Calculate ROAS
    let roas = 0;
    if (insights.purchase_roas && insights.purchase_roas.length > 0) {
      roas = parseFloat(insights.purchase_roas[0].value || 0);
    } else if (spend > 0 && revenue > 0) {
      roas = revenue / spend;
    }

    // Calculate CPA
    const cpa = conversions > 0 ? spend / conversions : 0;

    return {
      spend: spend,
      impressions: parseInt(insights.impressions || 0),
      clicks: parseInt(insights.clicks || 0),
      ctr: parseFloat(insights.ctr || 0) * 100,
      cpc: parseFloat(insights.cpc || 0),
      reach: parseInt(insights.reach || 0),
      conversions: conversions,
      revenue: revenue,
      roas: roas,
      cpa: cpa,
    };
  } catch (error) {
    console.error('Error fetching Meta Ads KPIs:', error);
    return null;
  }
}

/**
 * Fetch time-series data from Meta Ads API
 */
async function fetchMetaAdsTimeSeries(accountId, accessToken, since, until) {
  const baseUrl = 'https://graph.facebook.com/v18.0';

  try {
    const url = `${baseUrl}/act_${accountId}/insights?fields=spend,impressions,clicks,actions,action_values,purchase_roas&time_range={"since":"${since}","until":"${until}"}&time_increment=1&access_token=${accessToken}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      console.error('Meta API time-series error:', data.error);
      return [];
    }

    if (!data.data) return [];

    return data.data.map(day => {
      const spend = parseFloat(day.spend || 0);
      let revenue = 0;
      let conversions = 0;

      if (day.action_values) {
        const purchaseValues = day.action_values.filter(av =>
          av.action_type === 'purchase' ||
          av.action_type === 'omni_purchase' ||
          av.action_type === 'offsite_conversion.fb_pixel_purchase'
        );
        revenue = purchaseValues.reduce((sum, av) => sum + parseFloat(av.value || 0), 0);
      }

      if (day.actions) {
        const purchaseActions = day.actions.filter(a =>
          a.action_type === 'purchase' ||
          a.action_type === 'omni_purchase'
        );
        conversions = purchaseActions.reduce((sum, a) => sum + parseInt(a.value || 0), 0);
      }

      let roas = 0;
      if (day.purchase_roas && day.purchase_roas.length > 0) {
        roas = parseFloat(day.purchase_roas[0].value || 0);
      } else if (spend > 0 && revenue > 0) {
        roas = revenue / spend;
      }

      return {
        date: day.date_start,
        spend,
        revenue,
        conversions,
        impressions: parseInt(day.impressions || 0),
        clicks: parseInt(day.clicks || 0),
        roas,
      };
    });
  } catch (error) {
    console.error('Error fetching Meta Ads time-series:', error);
    return [];
  }
}

/**
 * Get account credentials from database
 */
async function getAccountCredentials(accountId, workspaceId) {
  try {
    const result = await query(
      `SELECT aa.id, aa.account_id, aa.platform, aa.workspace_id, ot.access_token
       FROM ad_accounts aa
       JOIN oauth_tokens ot ON ot.workspace_id = aa.workspace_id AND ot.platform = aa.platform
       WHERE aa.account_id = $1 AND aa.workspace_id = $2`,
      [accountId, workspaceId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    console.error('Error getting account credentials:', error);
    return null;
  }
}

/**
 * Get KPIs for a workspace/account
 */
async function getRealKPIs(workspaceId, dateRange, filters = {}) {
  const { source, accountId } = filters;

  if (source !== 'meta_ads' || !accountId) {
    // Return zeros if not Meta Ads
    return {
      metrics: {
        spend: 0,
        revenue: 0,
        conversions: 0,
        impressions: 0,
        clicks: 0,
        roas: 0,
        ctr: 0,
        cpc: 0,
        cpa: 0,
      },
      rowCount: 0,
      contribution: [],
    };
  }

  const credentials = await getAccountCredentials(accountId, workspaceId);
  if (!credentials) {
    console.error('No credentials found for account:', accountId);
    return {
      metrics: { spend: 0, revenue: 0, conversions: 0, roas: 0, impressions: 0, clicks: 0, ctr: 0, cpc: 0, cpa: 0 },
      rowCount: 0,
      contribution: [],
    };
  }

  const metrics = await fetchMetaAdsKPIs(accountId, credentials.access_token, dateRange.start, dateRange.end);

  if (!metrics) {
    return {
      metrics: { spend: 0, revenue: 0, conversions: 0, roas: 0, impressions: 0, clicks: 0, ctr: 0, cpc: 0, cpa: 0 },
      rowCount: 0,
      contribution: [],
    };
  }

  return {
    workspaceId,
    dateRange,
    metrics,
    rowCount: 1,
    contribution: [],
  };
}

/**
 * Compare two time periods
 */
async function comparePeriods(workspaceId, currentRange, previousRange, filters = {}) {
  const current = await getRealKPIs(workspaceId, currentRange, filters);
  const previous = await getRealKPIs(workspaceId, previousRange, filters);

  return {
    workspaceId,
    currentRange,
    previousRange,
    metrics: {
      current: current.metrics,
      previous: previous.metrics,
    },
    contributions: [],
  };
}

/**
 * Get time-series data
 */
async function getTimeSeries(workspaceId, dateRange, filters = {}) {
  const { source, accountId } = filters;

  if (source !== 'meta_ads' || !accountId) {
    return { data: [] };
  }

  const credentials = await getAccountCredentials(accountId, workspaceId);
  if (!credentials) {
    return { data: [] };
  }

  const data = await fetchMetaAdsTimeSeries(accountId, credentials.access_token, dateRange.start, dateRange.end);

  return {
    workspaceId,
    dateRange,
    granularity: 'daily',
    data,
  };
}

module.exports = {
  getRealKPIs,
  comparePeriods,
  getTimeSeries,
  getAccountCredentials,
  fetchMetaAdsKPIs,
  fetchMetaAdsTimeSeries,
};

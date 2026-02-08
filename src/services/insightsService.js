/**
 * Insights Service - Generates real-time insights from ad account data
 * Fetches metrics from all connected accounts and detects anomalies/opportunities
 */

const { query } = require('../config/database');
const config = require('../config/config');

// Insight type constants
const INSIGHT_TYPES = {
  ALERT: 'alert',
  OPPORTUNITY: 'opportunity',
  INFO: 'info',
};

// Thresholds for insight detection
const THRESHOLDS = {
  CPA_INCREASE_ALERT: 10, // Alert if CPA increases by 10%+
  ROAS_DECREASE_ALERT: 15, // Alert if ROAS decreases by 15%+
  SPEND_SPIKE_ALERT: 50, // Alert if daily spend spikes 50%+ above average
  SCALE_OPPORTUNITY_ROAS: 2.0, // Campaigns with ROAS > 2x are scale candidates
  MIN_SPEND_FOR_INSIGHTS: 10, // Minimum spend to generate insights
};

/**
 * Generate daily insights for a workspace
 * @param {string} workspaceId - Workspace UUID
 * @param {string} userId - User UUID for access verification
 * @returns {Object} Insights data with summary
 */
async function generateDailyInsights(workspaceId, userId) {
  try {
    // Get all ad accounts for this workspace
    const accountsResult = await query(
      `SELECT aa.id, aa.account_id, aa.account_name, aa.platform, aa.currency,
              ot.access_token
       FROM ad_accounts aa
       LEFT JOIN oauth_tokens ot ON ot.workspace_id = aa.workspace_id AND ot.platform = aa.platform
       WHERE aa.workspace_id = $1 AND aa.status = 'active'`,
      [workspaceId]
    );

    const accounts = accountsResult.rows;

    if (accounts.length === 0) {
      return {
        success: true,
        data: {
          insights: [],
          summary: {
            totalAccounts: 0,
            accountsWithData: 0,
            period: 'last_7_days',
            generatedAt: new Date().toISOString(),
            message: 'Connect ad accounts to see insights',
          },
        },
      };
    }

    // Fetch metrics for each account
    const metricsPromises = accounts.map(account =>
      fetchAccountMetrics(account)
    );

    const metricsResults = await Promise.all(metricsPromises);

    // Combine metrics from all accounts
    const allMetrics = metricsResults.filter(m => m !== null);

    if (allMetrics.length === 0) {
      return {
        success: true,
        data: {
          insights: [{
            id: 'no-data',
            type: INSIGHT_TYPES.INFO,
            icon: 'info',
            title: 'No recent data',
            detail: 'Your connected accounts have no recent activity. Check that your campaigns are running.',
            priority: 'low',
          }],
          summary: {
            totalAccounts: accounts.length,
            accountsWithData: 0,
            period: 'last_7_days',
            generatedAt: new Date().toISOString(),
          },
        },
      };
    }

    // Generate insights from the metrics
    const insights = detectInsights(allMetrics, accounts);

    // Sort by priority
    const sortedInsights = rankInsightsByPriority(insights);

    return {
      success: true,
      data: {
        insights: sortedInsights.slice(0, 5), // Top 5 insights
        summary: {
          totalAccounts: accounts.length,
          accountsWithData: allMetrics.length,
          period: 'last_7_days',
          generatedAt: new Date().toISOString(),
        },
      },
    };
  } catch (error) {
    console.error('[Insights Service] Error generating insights:', error);
    throw error;
  }
}

/**
 * Fetch metrics for a single account (current and previous period)
 */
async function fetchAccountMetrics(account) {
  const { account_id, platform, access_token, account_name } = account;

  if (!access_token) {
    console.log(`[Insights] No access token for ${platform} account ${account_id}`);
    return null;
  }

  // Calculate date ranges
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const twoWeeksAgo = new Date(weekAgo);
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 7);

  const currentEnd = today.toISOString().split('T')[0];
  const currentStart = weekAgo.toISOString().split('T')[0];
  const previousEnd = weekAgo.toISOString().split('T')[0];
  const previousStart = twoWeeksAgo.toISOString().split('T')[0];

  try {
    if (platform === 'meta') {
      return await fetchMetaMetrics(account_id, access_token, account_name, currentStart, currentEnd, previousStart, previousEnd);
    } else if (platform === 'google') {
      return await fetchGoogleMetrics(account_id, access_token, account_name, currentStart, currentEnd, previousStart, previousEnd);
    } else {
      return null;
    }
  } catch (error) {
    console.error(`[Insights] Error fetching ${platform} metrics for ${account_id}:`, error.message);
    return null;
  }
}

/**
 * Fetch Meta Ads metrics
 */
async function fetchMetaMetrics(accountId, accessToken, accountName, currentStart, currentEnd, previousStart, previousEnd) {
  const baseUrl = 'https://graph.facebook.com/v18.0';
  const fields = 'spend,impressions,clicks,actions,action_values,cpc,cpm,ctr,purchase_roas';

  try {
    // Fetch current period
    const currentUrl = `${baseUrl}/act_${accountId}/insights?fields=${fields}&time_range={"since":"${currentStart}","until":"${currentEnd}"}&access_token=${accessToken}`;
    const currentResponse = await fetch(currentUrl);
    const currentData = await currentResponse.json();

    // Fetch previous period
    const previousUrl = `${baseUrl}/act_${accountId}/insights?fields=${fields}&time_range={"since":"${previousStart}","until":"${previousEnd}"}&access_token=${accessToken}`;
    const previousResponse = await fetch(previousUrl);
    const previousData = await previousResponse.json();

    // Fetch top campaigns
    const campaignsUrl = `${baseUrl}/act_${accountId}/campaigns?fields=name,status,insights.time_range({"since":"${currentStart}","until":"${currentEnd}"}){spend,actions,action_values,purchase_roas}&limit=10&access_token=${accessToken}`;
    const campaignsResponse = await fetch(campaignsUrl);
    const campaignsData = await campaignsResponse.json();

    if (currentData.error) {
      console.error('[Insights] Meta API error:', currentData.error.message);
      return null;
    }

    const current = parseMetaInsights(currentData.data?.[0] || {});
    const previous = parseMetaInsights(previousData.data?.[0] || {});
    const campaigns = parseCampaigns(campaignsData.data || []);

    return {
      platform: 'meta',
      accountId,
      accountName,
      current,
      previous,
      campaigns,
    };
  } catch (error) {
    console.error('[Insights] Meta fetch error:', error);
    return null;
  }
}

/**
 * Fetch Google Ads metrics (placeholder - uses similar structure)
 */
async function fetchGoogleMetrics(accountId, accessToken, accountName, currentStart, currentEnd, previousStart, previousEnd) {
  // Google Ads API would be called here
  // For now, return null as it requires more complex setup
  return null;
}

/**
 * Parse Meta Ads insights response
 */
function parseMetaInsights(insights) {
  if (!insights) return null;

  let conversions = 0;
  let conversionValue = 0;

  if (insights.actions) {
    conversions = insights.actions.reduce((sum, a) => sum + parseFloat(a.value || 0), 0);
  }
  if (insights.action_values) {
    conversionValue = insights.action_values.reduce((sum, a) => sum + parseFloat(a.value || 0), 0);
  }

  const spend = parseFloat(insights.spend || 0);
  const clicks = parseInt(insights.clicks || 0);

  let roas = 0;
  if (insights.purchase_roas && insights.purchase_roas.length > 0) {
    roas = parseFloat(insights.purchase_roas[0].value || 0);
  } else if (spend > 0) {
    roas = conversionValue / spend;
  }

  const cpa = conversions > 0 ? spend / conversions : 0;

  return {
    spend,
    impressions: parseInt(insights.impressions || 0),
    clicks,
    conversions,
    conversionValue,
    roas,
    cpa,
    cpc: parseFloat(insights.cpc || 0),
    cpm: parseFloat(insights.cpm || 0),
    ctr: parseFloat(insights.ctr || 0),
  };
}

/**
 * Parse campaign data for opportunity detection
 */
function parseCampaigns(campaigns) {
  return campaigns
    .filter(c => c.insights?.data?.[0])
    .map(c => {
      const insights = c.insights.data[0];
      const spend = parseFloat(insights.spend || 0);
      let conversionValue = 0;
      if (insights.action_values) {
        conversionValue = insights.action_values.reduce((sum, a) => sum + parseFloat(a.value || 0), 0);
      }
      let roas = 0;
      if (insights.purchase_roas && insights.purchase_roas.length > 0) {
        roas = parseFloat(insights.purchase_roas[0].value || 0);
      } else if (spend > 0) {
        roas = conversionValue / spend;
      }

      return {
        name: c.name,
        status: c.status,
        spend,
        roas,
      };
    })
    .sort((a, b) => b.roas - a.roas);
}

/**
 * Detect insights from metrics data
 */
function detectInsights(allMetrics, accounts) {
  const insights = [];
  let insightId = 0;

  // Aggregate totals
  let totalSpend = 0;
  let totalSpendPrev = 0;
  let totalConversions = 0;
  let totalConversionsPrev = 0;
  let totalRevenue = 0;
  let totalRevenuePrev = 0;

  const topCampaigns = [];
  const scaleCandidates = [];
  const platformPerformance = {};

  for (const metrics of allMetrics) {
    if (!metrics.current) continue;

    const { current, previous, platform, accountName, campaigns } = metrics;

    totalSpend += current.spend;
    totalConversions += current.conversions;
    totalRevenue += current.conversionValue;

    if (previous) {
      totalSpendPrev += previous.spend;
      totalConversionsPrev += previous.conversions;
      totalRevenuePrev += previous.conversionValue;
    }

    // Track platform performance
    if (!platformPerformance[platform]) {
      platformPerformance[platform] = { spend: 0, revenue: 0 };
    }
    platformPerformance[platform].spend += current.spend;
    platformPerformance[platform].revenue += current.conversionValue;

    // Account-level CPA alert
    if (previous && current.cpa > 0 && previous.cpa > 0) {
      const cpaChange = ((current.cpa - previous.cpa) / previous.cpa) * 100;
      if (cpaChange >= THRESHOLDS.CPA_INCREASE_ALERT) {
        insights.push({
          id: `insight-${++insightId}`,
          type: INSIGHT_TYPES.ALERT,
          icon: 'warning',
          title: 'CPA trending up',
          detail: `Cost per acquisition increased ${cpaChange.toFixed(0)}% on ${accountName || platform} this week ($${current.cpa.toFixed(2)} vs $${previous.cpa.toFixed(2)})`,
          metrics: {
            current: current.cpa,
            previous: previous.cpa,
            change: cpaChange,
            unit: 'USD',
          },
          platform,
          action: `Review campaigns with high CPA on ${accountName || platform}`,
          priority: 'high',
        });
      }
    }

    // Account-level ROAS alert
    if (previous && current.roas > 0 && previous.roas > 0) {
      const roasChange = ((current.roas - previous.roas) / previous.roas) * 100;
      if (roasChange <= -THRESHOLDS.ROAS_DECREASE_ALERT) {
        insights.push({
          id: `insight-${++insightId}`,
          type: INSIGHT_TYPES.ALERT,
          icon: 'warning',
          title: 'ROAS declining',
          detail: `Return on ad spend dropped ${Math.abs(roasChange).toFixed(0)}% on ${accountName || platform} (${current.roas.toFixed(2)}x vs ${previous.roas.toFixed(2)}x)`,
          metrics: {
            current: current.roas,
            previous: previous.roas,
            change: roasChange,
            unit: 'x',
          },
          platform,
          action: 'Investigate underperforming campaigns',
          priority: 'high',
        });
      }
    }

    // Find scale opportunities from campaigns
    if (campaigns) {
      for (const campaign of campaigns) {
        if (campaign.status === 'ACTIVE' && campaign.roas >= THRESHOLDS.SCALE_OPPORTUNITY_ROAS && campaign.spend > THRESHOLDS.MIN_SPEND_FOR_INSIGHTS) {
          scaleCandidates.push({
            name: campaign.name,
            roas: campaign.roas,
            spend: campaign.spend,
            platform,
          });
        }
        if (campaign.roas > 0) {
          topCampaigns.push({
            name: campaign.name,
            roas: campaign.roas,
            spend: campaign.spend,
            platform,
          });
        }
      }
    }
  }

  // Scale opportunity insight
  if (scaleCandidates.length > 0) {
    const topScaleCampaigns = scaleCandidates.slice(0, 3);
    insights.push({
      id: `insight-${++insightId}`,
      type: INSIGHT_TYPES.OPPORTUNITY,
      icon: 'trending_up',
      title: 'Scale opportunity',
      detail: `${scaleCandidates.length} campaign${scaleCandidates.length > 1 ? 's' : ''} performing above ${THRESHOLDS.SCALE_OPPORTUNITY_ROAS}x ROAS. Consider increasing budget.`,
      campaigns: topScaleCampaigns.map(c => c.name),
      metrics: {
        count: scaleCandidates.length,
        avgRoas: scaleCandidates.reduce((sum, c) => sum + c.roas, 0) / scaleCandidates.length,
      },
      action: 'Review campaigns for budget increase',
      priority: 'high',
    });
  }

  // Top performer insight
  if (topCampaigns.length > 0) {
    topCampaigns.sort((a, b) => b.roas - a.roas);
    const top = topCampaigns[0];
    insights.push({
      id: `insight-${++insightId}`,
      type: INSIGHT_TYPES.INFO,
      icon: 'star',
      title: 'Top performer',
      detail: `"${top.name}" is your best performing campaign with ${top.roas.toFixed(2)}x ROAS`,
      metrics: {
        roas: top.roas,
        spend: top.spend,
      },
      platform: top.platform,
      action: 'Analyze what makes this campaign successful',
      priority: 'medium',
    });
  }

  // Weekly summary
  const totalRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
  const totalRoasPrev = totalSpendPrev > 0 ? totalRevenuePrev / totalSpendPrev : 0;
  const roasChange = totalRoasPrev > 0 ? ((totalRoas - totalRoasPrev) / totalRoasPrev) * 100 : 0;

  insights.push({
    id: `insight-${++insightId}`,
    type: INSIGHT_TYPES.INFO,
    icon: 'chart',
    title: 'Weekly summary',
    detail: `This week: $${totalSpend.toLocaleString(undefined, {maximumFractionDigits: 0})} spent, $${totalRevenue.toLocaleString(undefined, {maximumFractionDigits: 0})} revenue, ${totalRoas.toFixed(2)}x ROAS${roasChange !== 0 ? ` (${roasChange > 0 ? '+' : ''}${roasChange.toFixed(0)}% vs last week)` : ''}`,
    metrics: {
      spend: totalSpend,
      revenue: totalRevenue,
      roas: totalRoas,
      conversions: totalConversions,
      roasChange,
    },
    action: 'View full performance analysis',
    priority: 'low',
  });

  return insights;
}

/**
 * Sort insights by priority
 */
function rankInsightsByPriority(insights) {
  const priorityOrder = { high: 1, medium: 2, low: 3 };
  return insights.sort((a, b) => {
    const aPriority = priorityOrder[a.priority] || 3;
    const bPriority = priorityOrder[b.priority] || 3;
    return aPriority - bPriority;
  });
}

module.exports = {
  generateDailyInsights,
  INSIGHT_TYPES,
};

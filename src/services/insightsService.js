/**
 * Insights Service - Generates AI-powered insights using Gemini 3
 * Fetches metrics from all connected accounts and uses Gemini 3 to analyze
 */

const { query } = require('../config/database');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../config/config');

// Insight type constants
const INSIGHT_TYPES = {
  ALERT: 'alert',
  OPPORTUNITY: 'opportunity',
  INFO: 'info',
};

// Initialize Gemini 3 client
let gemini = null;
let geminiModel = null;

if (config.useGemini && config.geminiApiKey) {
  try {
    gemini = new GoogleGenerativeAI(config.geminiApiKey);
    geminiModel = gemini.getGenerativeModel({ model: config.geminiModel || 'gemini-3-flash-preview' });
    console.log('[Insights Service] Gemini 3 client initialized');
  } catch (error) {
    console.warn('[Insights Service] Failed to initialize Gemini 3:', error.message);
  }
}

/**
 * Generate daily insights for a workspace using Gemini 3
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
            poweredBy: 'gemini-3',
            message: 'Connect ad accounts to see AI-powered insights',
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
            poweredBy: 'gemini-3',
          }],
          summary: {
            totalAccounts: accounts.length,
            accountsWithData: 0,
            period: 'last_7_days',
            generatedAt: new Date().toISOString(),
            poweredBy: 'gemini-3',
          },
        },
      };
    }

    // Generate AI-powered insights using Gemini 3
    const insights = await generateGeminiInsights(allMetrics, accounts);

    return {
      success: true,
      data: {
        insights: insights.slice(0, 5), // Top 5 insights
        summary: {
          totalAccounts: accounts.length,
          accountsWithData: allMetrics.length,
          period: 'last_7_days',
          generatedAt: new Date().toISOString(),
          poweredBy: 'gemini-3',
        },
      },
    };
  } catch (error) {
    console.error('[Insights Service] Error generating insights:', error);
    // Fallback to rule-based if Gemini fails
    throw error;
  }
}

/**
 * Generate insights using Gemini 3 AI
 */
async function generateGeminiInsights(allMetrics, accounts) {
  if (!geminiModel) {
    console.warn('[Insights] Gemini 3 not available, using fallback');
    return detectInsightsFallback(allMetrics, accounts);
  }

  try {
    // Prepare metrics summary for Gemini 3
    const metricsData = prepareMetricsForAI(allMetrics);

    const prompt = `You are an expert marketing analyst. Analyze this advertising performance data and generate 3-5 actionable insights.

DATA:
${JSON.stringify(metricsData, null, 2)}

Generate insights in this exact JSON format (return ONLY valid JSON, no markdown):
{
  "insights": [
    {
      "type": "alert" | "opportunity" | "info",
      "icon": "warning" | "trending_up" | "star" | "chart",
      "title": "Short title (max 5 words)",
      "detail": "Specific insight with numbers and percentages",
      "action": "Clear action to take",
      "priority": "high" | "medium" | "low"
    }
  ]
}

RULES:
- Be specific with actual numbers from the data
- Focus on actionable insights, not just observations
- Alert type for problems (CPA up, ROAS down)
- Opportunity type for growth potential (high ROAS campaigns to scale)
- Info type for summaries and top performers
- Prioritize by business impact`;

    console.log('[Insights] Calling Gemini 3 for insights...');
    const startTime = Date.now();

    const result = await geminiModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1024,
      },
    });

    const duration = Date.now() - startTime;
    console.log(`[Insights] Gemini 3 responded in ${duration}ms`);

    const responseText = result.response.text();

    // Parse JSON response
    let parsed;
    try {
      // Remove markdown code blocks if present
      const cleanJson = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleanJson);
    } catch (parseError) {
      console.error('[Insights] Failed to parse Gemini response:', parseError);
      return detectInsightsFallback(allMetrics, accounts);
    }

    // Add IDs and poweredBy to insights
    const insights = (parsed.insights || []).map((insight, index) => ({
      id: `gemini-insight-${index + 1}`,
      ...insight,
      poweredBy: 'gemini-3',
    }));

    return insights;

  } catch (error) {
    console.error('[Insights] Gemini 3 error:', error.message);
    return detectInsightsFallback(allMetrics, accounts);
  }
}

/**
 * Prepare metrics data for Gemini 3 analysis
 */
function prepareMetricsForAI(allMetrics) {
  let totalSpend = 0;
  let totalSpendPrev = 0;
  let totalRevenue = 0;
  let totalRevenuePrev = 0;
  let totalConversions = 0;
  const accountSummaries = [];
  const topCampaigns = [];

  for (const metrics of allMetrics) {
    if (!metrics.current) continue;

    const { current, previous, platform, accountName, campaigns } = metrics;

    totalSpend += current.spend;
    totalRevenue += current.conversionValue;
    totalConversions += current.conversions;

    if (previous) {
      totalSpendPrev += previous.spend;
      totalRevenuePrev += previous.conversionValue;
    }

    // Account summary
    const cpaChange = previous && previous.cpa > 0
      ? ((current.cpa - previous.cpa) / previous.cpa * 100).toFixed(1)
      : null;
    const roasChange = previous && previous.roas > 0
      ? ((current.roas - previous.roas) / previous.roas * 100).toFixed(1)
      : null;

    accountSummaries.push({
      platform,
      accountName,
      spend: current.spend,
      revenue: current.conversionValue,
      roas: current.roas,
      cpa: current.cpa,
      conversions: current.conversions,
      cpaChange: cpaChange ? `${cpaChange}%` : 'N/A',
      roasChange: roasChange ? `${roasChange}%` : 'N/A',
    });

    // Top campaigns
    if (campaigns) {
      for (const c of campaigns.slice(0, 3)) {
        topCampaigns.push({
          name: c.name,
          platform,
          roas: c.roas,
          spend: c.spend,
        });
      }
    }
  }

  const overallRoas = totalSpend > 0 ? (totalRevenue / totalSpend).toFixed(2) : 0;
  const prevRoas = totalSpendPrev > 0 ? (totalRevenuePrev / totalSpendPrev).toFixed(2) : 0;
  const roasChange = prevRoas > 0 ? (((overallRoas - prevRoas) / prevRoas) * 100).toFixed(1) : 0;

  return {
    period: 'Last 7 days vs previous 7 days',
    overall: {
      totalSpend: `$${totalSpend.toFixed(0)}`,
      totalRevenue: `$${totalRevenue.toFixed(0)}`,
      totalConversions,
      overallRoas: `${overallRoas}x`,
      roasChange: `${roasChange}%`,
    },
    accounts: accountSummaries,
    topCampaigns: topCampaigns.sort((a, b) => b.roas - a.roas).slice(0, 5),
  };
}

/**
 * Fallback rule-based insight detection (when Gemini 3 unavailable)
 */
function detectInsightsFallback(allMetrics, accounts) {
  const insights = [];
  let insightId = 0;

  let totalSpend = 0;
  let totalRevenue = 0;

  for (const metrics of allMetrics) {
    if (!metrics.current) continue;
    totalSpend += metrics.current.spend;
    totalRevenue += metrics.current.conversionValue;
  }

  const totalRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

  insights.push({
    id: `insight-${++insightId}`,
    type: INSIGHT_TYPES.INFO,
    icon: 'chart',
    title: 'Weekly summary',
    detail: `This week: $${totalSpend.toLocaleString(undefined, {maximumFractionDigits: 0})} spent, $${totalRevenue.toLocaleString(undefined, {maximumFractionDigits: 0})} revenue, ${totalRoas.toFixed(2)}x ROAS`,
    action: 'View full performance analysis',
    priority: 'medium',
    poweredBy: 'fallback',
  });

  return insights;
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
 * Fetch Google Ads metrics (placeholder)
 */
async function fetchGoogleMetrics(accountId, accessToken, accountName, currentStart, currentEnd, previousStart, previousEnd) {
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
 * Parse campaign data
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

module.exports = {
  generateDailyInsights,
  INSIGHT_TYPES,
};

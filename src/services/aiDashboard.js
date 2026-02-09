/**
 * AI Dashboard Generation Service
 * Uses Gemini API to generate dashboards from natural language prompts
 */

const geminiClient = require('../ai/geminiClient');
const config = require('../config/config');
const CustomDataSource = require('../models/CustomDataSource');

// Available widget types and metrics for context
const AVAILABLE_WIDGETS = [
  'kpi_card',        // Single metric display with sparkline
  'line_chart',      // Time series trend data
  'bar_chart',       // Comparison data
  'pie_chart',       // Distribution data (donut style with legend)
  'table',           // Basic data table
  'campaign_table',  // Campaign performance table with icons, status badges, ROAS bars
  'comparison',      // Before/after comparison
  'gauge',           // Progress indicator
  'heatmap',         // Time-based heatmap (performance by day/hour)
  'funnel',          // Conversion funnel (Impressions → Clicks → Conversions → Purchases)
  'bubble_chart',    // Spend vs ROAS comparison (bubble size = conversions)
];

const AVAILABLE_METRICS = [
  // Paid advertising metrics
  { id: 'spend', name: 'Ad Spend', description: 'Total advertising expenditure', category: 'paid' },
  { id: 'impressions', name: 'Impressions', description: 'Number of times ads were shown', category: 'paid' },
  { id: 'clicks', name: 'Clicks', description: 'Number of ad clicks', category: 'paid' },
  { id: 'ctr', name: 'CTR', description: 'Click-through rate (clicks/impressions)', category: 'paid' },
  { id: 'cpc', name: 'CPC', description: 'Cost per click', category: 'paid' },
  { id: 'cpm', name: 'CPM', description: 'Cost per 1000 impressions', category: 'paid' },
  { id: 'reach', name: 'Reach', description: 'Unique users who saw the ad', category: 'paid' },
  { id: 'frequency', name: 'Frequency', description: 'Average times each user saw the ad', category: 'paid' },
  { id: 'conversions', name: 'Conversions', description: 'Number of desired actions completed', category: 'paid' },
  { id: 'cost_per_conversion', name: 'Cost Per Conversion', description: 'Cost for each conversion', category: 'paid' },
  { id: 'roas', name: 'ROAS', description: 'Return on ad spend', category: 'paid' },
  { id: 'revenue', name: 'Revenue', description: 'Total revenue generated', category: 'paid' },
  // Search Console (organic search) metrics
  { id: 'search_clicks', name: 'Organic Clicks', description: 'Clicks from organic search results', category: 'organic' },
  { id: 'search_impressions', name: 'Search Impressions', description: 'Times site appeared in search results', category: 'organic' },
  { id: 'search_ctr', name: 'Search CTR', description: 'Click-through rate from search results', category: 'organic' },
  { id: 'average_position', name: 'Average Position', description: 'Average ranking position in search results', category: 'organic' },
  { id: 'top_queries', name: 'Top Queries', description: 'Keywords driving traffic to site', category: 'organic' },
  { id: 'top_pages', name: 'Top Pages', description: 'Best performing pages in search', category: 'organic' },
  { id: 'device_breakdown', name: 'Device Breakdown', description: 'Traffic split by device type', category: 'organic' },
  { id: 'country_breakdown', name: 'Country Breakdown', description: 'Traffic split by country', category: 'organic' },
  { id: 'query_page_analysis', name: 'Query-Page Analysis', description: 'Which queries lead to which pages', category: 'organic' },
];

/**
 * Generate dashboard configuration from user prompt using Gemini
 */
async function generateDashboardFromPrompt(prompt, options = {}) {
  const { adAccountId, workspaceId, platform = 'meta', customSourceIds = [] } = options;

  if (!config.geminiApiKey) {
    throw new Error('Gemini API key not configured. Please set GEMINI_API_KEY in environment variables.');
  }

  // Fetch custom data sources if provided
  const customSources = [];
  if (customSourceIds.length > 0) {
    for (const sourceId of customSourceIds) {
      try {
        const source = await CustomDataSource.findById(sourceId);
        if (source) {
          customSources.push({
            id: source.id,
            name: source.source_name,
            type: source.source_type,
            metrics: source.metric_columns || [],
            dimensions: source.dimension_columns || [],
            dateColumn: source.date_column,
          });
        }
      } catch (error) {
        console.error(`Failed to load custom source ${sourceId}:`, error);
      }
    }
  }

  // Build custom metrics list
  const customMetrics = customSources.flatMap(source =>
    source.metrics.map(metric => ({
      id: `custom_${source.id}_${metric}`,
      name: `${source.name} - ${metric}`,
      description: `${metric} from custom data source: ${source.name}`,
      category: 'custom',
      sourceId: source.id,
      sourceName: source.name,
      metricName: metric,
    }))
  );

  const allMetrics = [...AVAILABLE_METRICS, ...customMetrics];

  const fullPrompt = `You are an expert advertising analytics dashboard designer. Your task is to create comprehensive, visually stunning dashboards with advanced widget types.

Available widget types (USE ALL OF THESE for rich dashboards):
- kpi_card: Single metric with value, change percentage, and sparkline (use for: spend, revenue, ROAS, conversions, CTR)
- line_chart: Time series trend showing performance over time (use for: Revenue vs Spend trends)
- pie_chart: Donut chart with legend showing distribution (use for: Spend by Campaign breakdown)
- campaign_table: Rich table with campaign icons, status badges, and ROAS progress bars (use for: Campaign Performance)
- funnel: Conversion funnel showing drop-off rates (Impressions → Clicks → Add to Cart → Conversions → Purchases)
- bubble_chart: Campaign comparison with X=Spend, Y=ROAS, bubble size=conversions
- heatmap: Performance by day of week and time of day
- bar_chart: Comparison between items
- comparison: Before/after period comparison
- gauge: Progress toward a goal

Available metrics:
${allMetrics.map(m => `- ${m.id}: ${m.name} - ${m.description}`).join('\n')}

${customSources.length > 0 ? `
Custom Data Sources Available:
${customSources.map(s => `- ${s.name} (${s.type}): ${s.metrics.join(', ')}`).join('\n')}

When using custom data sources, set the widget's dataSource to:
{
  "type": "custom_data",
  "customSourceId": "source_id",
  "metric": "metric_name",
  "aggregation": "sum|avg|count"
}
` : ''}

Dashboard grid is 12 columns wide. Widgets have positions: { x: 0-11, y: row, w: width (1-12), h: height (typically 4-8) }

IMPORTANT - Create a RICH dashboard with these widget combinations:
1. Row 0 (y=0): 4 KPI cards (w=3 each) for Spend, Revenue, ROAS, Conversions
2. Row 1 (y=4): 1 line_chart (w=8) for trends + 1 pie_chart (w=4) for Spend by Campaign
3. Row 2 (y=8): 1 funnel (w=6) for Conversion Funnel + 1 bubble_chart (w=6) for Campaign Comparison
4. Row 3 (y=12): 1 heatmap (w=12) for Performance by Day & Time
5. Row 4 (y=16): 1 campaign_table (w=12) for detailed Campaign Performance

User Request: "${prompt}"

Create a comprehensive advertising analytics dashboard. ALWAYS include: kpi_cards, pie_chart, funnel, bubble_chart, campaign_table, and heatmap for the richest experience.

Respond ONLY with valid JSON in this exact format (no markdown, no code blocks, just pure JSON):
{
  "name": "Dashboard name based on the prompt",
  "description": "Brief description of what this dashboard tracks",
  "widgets": [
    {
      "widgetType": "kpi_card",
      "title": "Total Spend",
      "metric": "spend",
      "position": { "x": 0, "y": 0, "w": 3, "h": 4 },
      "description": "Total advertising spend"
    },
    {
      "widgetType": "pie_chart",
      "title": "Spend by Campaign",
      "metric": "spend",
      "position": { "x": 8, "y": 4, "w": 4, "h": 6 },
      "description": "Budget allocation across campaigns"
    },
    {
      "widgetType": "funnel",
      "title": "Conversion Funnel",
      "metric": "conversions",
      "position": { "x": 0, "y": 8, "w": 6, "h": 6 },
      "description": "User journey from impression to purchase"
    },
    {
      "widgetType": "bubble_chart",
      "title": "Campaign Comparison",
      "metric": "roas",
      "position": { "x": 6, "y": 8, "w": 6, "h": 6 },
      "description": "Spend vs ROAS (bubble size = conversions)"
    },
    {
      "widgetType": "campaign_table",
      "title": "Campaign Performance",
      "metric": "campaigns",
      "position": { "x": 0, "y": 16, "w": 12, "h": 8 },
      "description": "Detailed campaign metrics with status and ROAS"
    }
  ],
  "insights": [
    "Key insight or recommendation about this dashboard"
  ]
}`;

  try {
    console.log('[AI Dashboard Service] Generating dashboard with Gemini AI...');
    console.log('[AI Dashboard Service] Prompt length:', fullPrompt.length);
    const responseText = await geminiClient.generate(fullPrompt);
    console.log('[AI Dashboard Service] Response received, length:', responseText?.length);

    // Parse JSON from response (handle potential markdown code blocks)
    let jsonStr = responseText.trim();
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
      console.log('[AI Dashboard Service] Extracted JSON from code block');
    }

    // Remove any leading/trailing non-JSON characters
    const jsonStart = jsonStr.indexOf('{');
    const jsonEnd = jsonStr.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      jsonStr = jsonStr.substring(jsonStart, jsonEnd + 1);
    }

    console.log('[AI Dashboard Service] Parsing JSON, length:', jsonStr.length);
    const dashboardConfig = JSON.parse(jsonStr);
    console.log('[AI Dashboard Service] JSON parsed successfully, widgets:', dashboardConfig.widgets?.length);

    // Validate and enhance the configuration
    const validatedConfig = validateAndEnhanceConfig(dashboardConfig, options);
    console.log('[AI Dashboard Service] Config validated, widgets:', validatedConfig.widgets?.length);

    return {
      success: true,
      dashboard: validatedConfig,
      tokensUsed: 0, // Gemini doesn't report tokens the same way
    };
  } catch (error) {
    console.error('[AI Dashboard Service] Error:', error.message);
    console.error('[AI Dashboard Service] Stack:', error.stack);
    throw error;
  }
}

/**
 * Validate and enhance the AI-generated configuration
 */
function validateAndEnhanceConfig(config, options) {
  const { adAccountId, customSourceIds = [] } = options;

  // Ensure required fields
  if (!config.name) config.name = 'AI Generated Dashboard';
  if (!config.description) config.description = 'Dashboard created by AI';
  if (!config.widgets) config.widgets = [];
  if (!config.insights) config.insights = [];

  // Validate and enhance each widget
  config.widgets = config.widgets.map((widget, index) => {
    // Ensure valid widget type (normalize aliases)
    const widgetTypeAliases = {
      'donut_chart': 'pie_chart',
      'donut': 'pie_chart',
      'scatter_chart': 'bubble_chart',
      'scatter': 'bubble_chart',
      'data_table': 'campaign_table',
      'performance_table': 'campaign_table',
    };

    if (widgetTypeAliases[widget.widgetType]) {
      widget.widgetType = widgetTypeAliases[widget.widgetType];
    }

    if (!AVAILABLE_WIDGETS.includes(widget.widgetType)) {
      widget.widgetType = 'kpi_card';
    }

    // Check if this is a custom data widget
    const isCustomMetric = widget.metric?.startsWith('custom_');

    // Handle data source configuration
    if (widget.dataSource?.type === 'custom_data' || isCustomMetric) {
      // Custom data source widget
      let customSourceId = widget.dataSource?.customSourceId;
      let metricName = widget.dataSource?.metric;

      // Extract from metric ID if not explicitly provided
      if (isCustomMetric && !customSourceId) {
        const parts = widget.metric.split('_');
        if (parts.length >= 3) {
          customSourceId = parts[1]; // custom_<sourceId>_<metric>
          metricName = parts.slice(2).join('_');
        }
      }

      // Validate custom source exists in provided sources
      if (customSourceId && customSourceIds.includes(customSourceId)) {
        widget.dataSource = {
          type: 'custom_data',
          customSourceId,
          metric: metricName || widget.metric,
          aggregation: widget.dataSource?.aggregation || 'sum',
          filters: widget.dataSource?.filters || {},
          groupBy: widget.dataSource?.groupBy || [],
          dateRange: widget.dataSource?.dateRange || 'last_30_days',
        };
      } else {
        // Fallback to first custom source or platform data
        if (customSourceIds.length > 0) {
          widget.dataSource = {
            type: 'custom_data',
            customSourceId: customSourceIds[0],
            metric: metricName || 'spend',
            aggregation: 'sum',
            dateRange: 'last_30_days',
          };
        } else {
          // No custom sources available, use platform data
          widget.dataSource = {
            type: 'platform',
            adAccountId: adAccountId || null,
            metric: 'spend',
            dateRange: 'last_30_days',
          };
        }
      }
    } else {
      // Platform data source widget
      const validMetric = AVAILABLE_METRICS.find(m => m.id === widget.metric);
      if (!validMetric) {
        widget.metric = 'spend';
      }

      widget.dataSource = {
        type: 'platform',
        adAccountId: adAccountId || null,
        metric: widget.metric,
        dateRange: 'last_30_days',
      };
    }

    // Ensure valid position
    if (!widget.position) {
      widget.position = {
        x: (index % 3) * 4,
        y: Math.floor(index / 3) * 4,
        w: 4,
        h: 4,
      };
    }

    // Clamp position values
    widget.position.x = Math.max(0, Math.min(11, widget.position.x || 0));
    widget.position.y = Math.max(0, widget.position.y || 0);
    widget.position.w = Math.max(1, Math.min(12, widget.position.w || 4));
    widget.position.h = Math.max(2, Math.min(12, widget.position.h || 4));

    return widget;
  });

  return config;
}

/**
 * Generate dashboard recommendations based on existing data using Gemini
 */
async function generateRecommendations(dashboardId, metrics) {
  if (!config.geminiApiKey) {
    throw new Error('Gemini API key not configured');
  }

  const fullPrompt = `You are an expert advertising analyst. Analyze the provided metrics and generate actionable recommendations.

Metrics to analyze:
${JSON.stringify(metrics, null, 2)}

Provide recommendations in this exact JSON format (no markdown, no code blocks, just pure JSON):
{
  "recommendations": [
    {
      "type": "optimization|alert|insight",
      "priority": "high|medium|low",
      "title": "Short title",
      "description": "Detailed recommendation",
      "metric": "affected_metric",
      "suggestedAction": "What to do"
    }
  ],
  "summary": "Brief overall analysis"
}`;

  try {
    const responseText = await geminiClient.generate(fullPrompt);

    let jsonStr = responseText.trim();
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    // Remove any leading/trailing non-JSON characters
    const jsonStart = jsonStr.indexOf('{');
    const jsonEnd = jsonStr.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      jsonStr = jsonStr.substring(jsonStart, jsonEnd + 1);
    }

    return JSON.parse(jsonStr);
  } catch (error) {
    console.error('Recommendation generation error:', error);
    throw error;
  }
}

/**
 * Suggest improvements for an existing dashboard using Gemini
 */
async function suggestDashboardImprovements(currentWidgets, userGoals) {
  if (!config.geminiApiKey) {
    throw new Error('Gemini API key not configured');
  }

  const fullPrompt = `You are an expert dashboard designer. Analyze the current dashboard configuration and suggest improvements.

Current available widgets: ${AVAILABLE_WIDGETS.join(', ')}
Available metrics: ${AVAILABLE_METRICS.map(m => m.id).join(', ')}

Current dashboard widgets:
${JSON.stringify(currentWidgets, null, 2)}

User goals: ${userGoals}

Suggest improvements to make this dashboard more effective.

Provide suggestions in this exact JSON format (no markdown, no code blocks, just pure JSON):
{
  "suggestions": [
    {
      "type": "add|remove|modify|reposition",
      "widget": { },
      "reason": "Why this improvement helps",
      "impact": "Expected benefit"
    }
  ],
  "overallScore": 7,
  "summary": "Overall assessment"
}`;

  try {
    const responseText = await geminiClient.generate(fullPrompt);

    let jsonStr = responseText.trim();
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    // Remove any leading/trailing non-JSON characters
    const jsonStart = jsonStr.indexOf('{');
    const jsonEnd = jsonStr.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      jsonStr = jsonStr.substring(jsonStart, jsonEnd + 1);
    }

    return JSON.parse(jsonStr);
  } catch (error) {
    console.error('Dashboard improvement suggestion error:', error);
    throw error;
  }
}

module.exports = {
  generateDashboardFromPrompt,
  generateRecommendations,
  suggestDashboardImprovements,
  AVAILABLE_WIDGETS,
  AVAILABLE_METRICS,
};

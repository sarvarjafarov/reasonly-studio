-- Migration: Add new widget types (bubble_chart, campaign_table)
-- Date: 2026-02-09

-- Drop the existing constraint
ALTER TABLE dashboard_widgets
DROP CONSTRAINT IF EXISTS dashboard_widgets_widget_type_check;

-- Add the new constraint with additional widget types
ALTER TABLE dashboard_widgets
ADD CONSTRAINT dashboard_widgets_widget_type_check
CHECK (widget_type IN (
    'kpi_card', 'line_chart', 'bar_chart', 'pie_chart', 'area_chart',
    'table', 'funnel', 'heatmap', 'gauge', 'comparison',
    'bubble_chart', 'campaign_table', 'kpi_tracker', 'budget_pacing'
));

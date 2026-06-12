-- Fix cost_budget_usd: replace JSONB null with 0 (disabled sentinel).
-- system_config.value is NOT NULL, so null cannot be stored via the app update path.
UPDATE system_config SET value = '0'::jsonb WHERE key = 'cost_budget_usd' AND value IS NULL;

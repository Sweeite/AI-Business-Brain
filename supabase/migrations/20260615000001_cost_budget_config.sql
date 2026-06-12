-- Add cost budget configuration keys to system_config
INSERT INTO system_config (id, key, value, updated_by, updated_at)
VALUES
  (gen_random_uuid(), 'cost_budget_usd',          'null'::jsonb, '00000000-0000-0000-0000-000000000001', now()),
  (gen_random_uuid(), 'cost_alert_threshold_pct',  '80'::jsonb,   '00000000-0000-0000-0000-000000000001', now())
ON CONFLICT (key) DO NOTHING;

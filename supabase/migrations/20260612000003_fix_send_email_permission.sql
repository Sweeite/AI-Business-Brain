-- Rename manage_integrations → send_email on the send_email tool.
-- The old key was semantically incorrect; it only gated the send_email tool,
-- not integration management broadly. send_email matches the taxonomy in PERMISSION_NODES.
UPDATE tools SET required_permission = 'send_email' WHERE name = 'send_email';

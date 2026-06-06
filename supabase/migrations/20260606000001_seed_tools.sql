-- Seed tool rows (separated from initial migration for idempotent re-apply)

INSERT INTO tools (id, name, description, connector_type, action_type, required_permission, is_active) VALUES
(
  '30000000-0000-0000-0000-000000000001',
  'search_memory',
  'Vector search over the memory store',
  'internal',
  'read',
  'query_brain',
  true
),
(
  '30000000-0000-0000-0000-000000000002',
  'fetch_gmail',
  'Read emails from a connected Gmail account',
  'gmail',
  'read',
  'query_brain',
  true
),
(
  '30000000-0000-0000-0000-000000000003',
  'fetch_drive_file',
  'Read a file from Google Drive',
  'google_drive',
  'read',
  'query_brain',
  true
),
(
  '30000000-0000-0000-0000-000000000004',
  'search_drive',
  'Search Google Drive files',
  'google_drive',
  'read',
  'query_brain',
  true
),
(
  '30000000-0000-0000-0000-000000000005',
  'propose_memory',
  'Propose a new memory record (goes through write pipeline)',
  'internal',
  'write',
  'capture_memory',
  true
),
(
  '30000000-0000-0000-0000-000000000006',
  'create_gmail_draft',
  'Create an email draft in Gmail',
  'gmail',
  'write',
  'capture_memory',
  true
),
(
  '30000000-0000-0000-0000-000000000007',
  'send_email',
  'Send an email via Gmail',
  'gmail',
  'write',
  'manage_integrations',
  true
),
(
  '30000000-0000-0000-0000-000000000008',
  'create_drive_file',
  'Create a file in Google Drive',
  'google_drive',
  'write',
  'capture_memory',
  true
),
(
  '30000000-0000-0000-0000-000000000009',
  'update_drive_file',
  'Update an existing file in Google Drive',
  'google_drive',
  'write',
  'capture_memory',
  true
)
ON CONFLICT (id) DO NOTHING;

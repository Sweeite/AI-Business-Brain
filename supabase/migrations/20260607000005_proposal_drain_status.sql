-- Add 'pending_review' status value to memory_proposals.
-- This is the state for proposals routed to the human review queue by the drain pipeline.
ALTER TABLE memory_proposals
  DROP CONSTRAINT IF EXISTS memory_proposals_status_check;
ALTER TABLE memory_proposals
  ADD CONSTRAINT memory_proposals_status_check
  CHECK (status IN ('pending', 'pending_review', 'approved', 'rejected'));

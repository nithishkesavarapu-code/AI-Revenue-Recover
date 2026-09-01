-- A payment link can be created without an external message being delivered.
-- Preserve that distinction in the customer-contact audit trail.
ALTER TYPE "ContactStatus" ADD VALUE IF NOT EXISTS 'NOT_SENT';

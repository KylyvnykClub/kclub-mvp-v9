-- NOTE: hand-written migration. Do not use semicolons inside comments.

-- Drop the inbox and its enum. Notifications are a projection of events the
-- member has already been shown, so the rollback loses read state and nothing
-- the system needs to reconstruct.
DROP INDEX IF EXISTS notifications_dedupe_idx;

DROP INDEX IF EXISTS notifications_member_unread_idx;

DROP INDEX IF EXISTS notifications_member_created_idx;

DROP TABLE IF EXISTS notifications;

DROP TYPE IF EXISTS notification_kind;

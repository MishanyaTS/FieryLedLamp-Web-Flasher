ALTER TABLE users ADD COLUMN notify_forum TINYINT(1) NOT NULL DEFAULT 0 AFTER notify_updates;
ALTER TABLE users ADD COLUMN avatar_file VARCHAR(120) NULL AFTER notify_forum;
ALTER TABLE users ADD COLUMN avatar_mime VARCHAR(100) NULL AFTER avatar_file;

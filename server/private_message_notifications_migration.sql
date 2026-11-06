-- Письма о новых личных сообщениях (по умолчанию отключены)
ALTER TABLE users ADD COLUMN notify_messages TINYINT(1) NOT NULL DEFAULT 0 AFTER notify_forum;

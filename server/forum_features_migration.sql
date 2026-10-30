ALTER TABLE discussion_messages ADD COLUMN parent_id BIGINT UNSIGNED NULL AFTER user_id;
ALTER TABLE discussion_messages ADD COLUMN edited_at DATETIME NULL AFTER created_at;
ALTER TABLE discussion_messages ADD COLUMN deleted_at DATETIME NULL AFTER edited_at;
ALTER TABLE discussion_messages ADD KEY idx_discussion_parent (parent_id);

CREATE TABLE IF NOT EXISTS discussion_likes (
  message_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (message_id,user_id),
  KEY idx_discussion_like_user (user_id),
  CONSTRAINT fk_discussion_like_message FOREIGN KEY (message_id) REFERENCES discussion_messages(id) ON DELETE CASCADE,
  CONSTRAINT fk_discussion_like_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS discussion_attachments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  message_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(120) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_discussion_attachment_message (message_id),
  KEY idx_discussion_attachment_user (user_id),
  CONSTRAINT fk_discussion_attachment_message FOREIGN KEY (message_id) REFERENCES discussion_messages(id) ON DELETE CASCADE,
  CONSTRAINT fk_discussion_attachment_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

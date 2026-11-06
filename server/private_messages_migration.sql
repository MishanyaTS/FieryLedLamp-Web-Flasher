-- Личные сообщения: переписки видят только два участника.
-- Выполните этот файл в существующей базе Fiery Led Lamp на HostiMan.
CREATE TABLE IF NOT EXISTS private_message_threads (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_low_id BIGINT UNSIGNED NOT NULL,
  user_high_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_private_pair (user_low_id, user_high_id),
  KEY idx_private_low_updated (user_low_id, updated_at),
  KEY idx_private_high_updated (user_high_id, updated_at),
  CONSTRAINT fk_private_low FOREIGN KEY (user_low_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_private_high FOREIGN KEY (user_high_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS private_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  thread_id BIGINT UNSIGNED NOT NULL,
  sender_id BIGINT UNSIGNED NOT NULL,
  body TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_private_thread (thread_id, id),
  KEY idx_private_unread (thread_id, sender_id, read_at),
  KEY idx_private_sent (sender_id, created_at),
  CONSTRAINT fk_private_thread FOREIGN KEY (thread_id) REFERENCES private_message_threads(id) ON DELETE CASCADE,
  CONSTRAINT fk_private_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS analytics_counters (
  stat_date DATE NOT NULL,
  event_type VARCHAR(40) NOT NULL,
  item VARCHAR(80) NOT NULL DEFAULT '',
  path VARCHAR(255) NOT NULL DEFAULT '',
  country_code CHAR(2) NOT NULL DEFAULT 'XX',
  country_name VARCHAR(80) NOT NULL DEFAULT 'Неизвестно',
  event_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (stat_date,event_type,item,path,country_code),
  KEY idx_analytics_event_date (event_type,stat_date),
  KEY idx_analytics_country_date (country_code,stat_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS analytics_unique_visitors (
  stat_date DATE NOT NULL,
  visitor_hash CHAR(64) NOT NULL,
  country_code CHAR(2) NOT NULL DEFAULT 'XX',
  country_name VARCHAR(80) NOT NULL DEFAULT 'Неизвестно',
  PRIMARY KEY (stat_date,visitor_hash),
  KEY idx_unique_visitor (visitor_hash),
  KEY idx_unique_country_date (country_code,stat_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS analytics_geo_cache (
  visitor_hash CHAR(64) NOT NULL,
  country_code CHAR(2) NOT NULL DEFAULT 'XX',
  country_name VARCHAR(80) NOT NULL DEFAULT 'Неизвестно',
  resolved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (visitor_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

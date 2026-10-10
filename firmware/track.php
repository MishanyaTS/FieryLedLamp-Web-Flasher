<?php
declare(strict_types=1);

// Temporary same-origin statistics endpoint for firmware.fieryledlamp.ru.
// It writes directly to the same MySQL analytics tables used by fieryledlamp.ru.
// This avoids HTTP Basic Auth on the main site while it is temporarily protected.

function pixel(): never {
    header('Content-Type: image/gif');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    echo base64_decode('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==');
    exit;
}

$event = (string)($_GET['event'] ?? '');
if (!in_array($event, ['firmware_page_view', 'firmware_download'], true)) {
    pixel();
}

$configFile = dirname(__DIR__) . '/fieryledlamp-private/config.php';
if (!is_file($configFile)) {
    pixel();
}

$config = require $configFile;
if (!is_array($config)) {
    pixel();
}

try {
    $pdo = new PDO(
        (string)$config['db_dsn'],
        (string)$config['db_user'],
        (string)$config['db_password'],
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );
} catch (Throwable $e) {
    pixel();
}

function visitor_hash(array $config, string $provided = ''): string {
    $seed = trim($provided);
    if ($seed === '' || strlen($seed) > 160) {
        $seed = (string)($_SERVER['REMOTE_ADDR'] ?? '') . '|' . (string)($_SERVER['HTTP_USER_AGENT'] ?? '');
    }
    $key = (string)($config['app_key'] ?? 'fieryledlamp');
    return hash_hmac('sha256', $seed, $key);
}

function country_for(PDO $pdo, string $hash): array {
    try {
        $stmt = $pdo->prepare('SELECT country_code,country_name FROM analytics_geo_cache WHERE visitor_hash=? LIMIT 1');
        $stmt->execute([$hash]);
        $cached = $stmt->fetch();
        if ($cached) {
            return [
                (string)($cached['country_code'] ?: 'XX'),
                (string)($cached['country_name'] ?: 'Неизвестно'),
            ];
        }
    } catch (Throwable $e) {
        return ['XX', 'Неизвестно'];
    }

    $code = 'XX';
    $name = 'Неизвестно';
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? '');
    $public = $ip !== ''
        && filter_var($ip, FILTER_VALIDATE_IP)
        && filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE);

    if ($public && function_exists('curl_init')) {
        $ch = curl_init('https://ipwho.is/' . rawurlencode($ip) . '?fields=success,country,country_code');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 3,
            CURLOPT_CONNECTTIMEOUT => 2,
            CURLOPT_USERAGENT => 'FieryLedLamp-Firmware-Stats/1.0',
        ]);
        $raw = curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($status >= 200 && $status < 300 && is_string($raw) && $raw !== '') {
            $geo = json_decode($raw, true);
            if (is_array($geo) && !empty($geo['success'])) {
                $candidateCode = strtoupper((string)($geo['country_code'] ?? ''));
                $candidateName = trim((string)($geo['country'] ?? ''));
                if (preg_match('/^[A-Z]{2}$/', $candidateCode)) $code = $candidateCode;
                if ($candidateName !== '') $name = substr($candidateName, 0, 80);
            }
        }
    }

    try {
        $stmt = $pdo->prepare('INSERT INTO analytics_geo_cache(visitor_hash,country_code,country_name,resolved_at) VALUES(?,?,?,NOW()) ON DUPLICATE KEY UPDATE country_code=VALUES(country_code),country_name=VALUES(country_name),resolved_at=VALUES(resolved_at)');
        $stmt->execute([$hash, $code, $name]);
    } catch (Throwable $e) {}

    return [$code, $name];
}

try {
    $item = substr(trim((string)($_GET['item'] ?? '')), 0, 80);
    $path = substr(trim((string)($_GET['path'] ?? '/')), 0, 255);
    $hash = visitor_hash($config, (string)($_GET['visitorId'] ?? ''));
    [$countryCode, $countryName] = country_for($pdo, $hash);

    $stmt = $pdo->prepare('INSERT INTO analytics_counters(stat_date,event_type,item,path,country_code,country_name,event_count) VALUES(CURDATE(),?,?,?,?,?,1) ON DUPLICATE KEY UPDATE event_count=event_count+1,country_name=VALUES(country_name)');
    $stmt->execute([$event, $item, $path, $countryCode, $countryName]);

    if ($event === 'firmware_page_view') {
        $stmt = $pdo->prepare('INSERT IGNORE INTO analytics_unique_visitors(stat_date,visitor_hash,country_code,country_name) VALUES(CURDATE(),?,?,?)');
        $stmt->execute([$hash, $countryCode, $countryName]);
    }
} catch (Throwable $e) {
    // Statistics must never affect the flasher.
}

pixel();

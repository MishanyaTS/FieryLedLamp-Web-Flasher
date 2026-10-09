<?php
declare(strict_types=1);

function json_response(array $data, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

$configFile = dirname(__DIR__, 2) . '/fieryledlamp-private/config.php';
if (!is_file($configFile)) {
    json_response(['ok' => false, 'message' => 'Регистрация ещё не настроена на сервере.'], 503);
}
$config = require $configFile;
if (!is_array($config)) {
    json_response(['ok' => false, 'message' => 'Ошибка конфигурации сервера.'], 500);
}

session_name('fieryledlamp_session');
session_set_cookie_params([
    'lifetime' => 60 * 60 * 24 * 30,
    'path' => '/',
    'secure' => true,
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();
if (empty($_SESSION['csrf'])) {
    $_SESSION['csrf'] = bin2hex(random_bytes(24));
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
    json_response(['ok' => false, 'message' => 'База данных недоступна.'], 503);
}

$action = (string)($_GET['action'] ?? '');

if ($action === 'track') {
    $origin = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
    if ($origin === 'https://firmware.fieryledlamp.ru') {
        header('Access-Control-Allow-Origin: https://firmware.fieryledlamp.ru');
        header('Vary: Origin');
    }
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'verify-email') {
    verify_email($pdo, $config);
}
if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'unsubscribe') {
    unsubscribe($pdo, $config);
}

switch ($action) {
    case 'register':
        require_method('POST');
        register_user($pdo, $config);
        break;
    case 'login':
        require_method('POST');
        login_user($pdo);
        break;
    case 'logout':
        require_method('POST');
        require_csrf();
        logout_user();
        break;
    case 'me':
        require_method('GET');
        current_user_response($pdo);
        break;
    case 'preferences':
        require_method('POST');
        require_csrf();
        update_preferences($pdo);
        break;
    case 'resend-verification':
        require_method('POST');
        require_csrf();
        resend_verification($pdo, $config);
        break;
    case 'request-reset':
        require_method('POST');
        request_reset($pdo, $config);
        break;
    case 'reset-password':
        require_method('POST');
        reset_password($pdo);
        break;
    case 'admin-providers':
        require_method('GET');
        admin_providers($pdo, $config);
        break;
    case 'admin-notify':
        require_method('POST');
        require_csrf();
        admin_notify($pdo, $config);
        break;
    case 'track':
        require_method('POST');
        track_public_event($pdo, $config);
        break;
    case 'track-pixel':
        require_method('GET');
        track_pixel_event($pdo, $config);
        break;
    case 'download':
        require_method('GET');
        track_download_and_redirect($pdo, $config);
        break;
    case 'admin-stats':
        require_method('GET');
        admin_stats($pdo);
        break;
    case 'admin-users':
        require_method('GET');
        admin_users($pdo);
        break;
    default:
        json_response(['ok' => false, 'message' => 'Неизвестный запрос.'], 404);
}

function require_method(string $method): void {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== $method) {
        json_response(['ok' => false, 'message' => 'Метод не поддерживается.'], 405);
    }
}

function input_json(): array {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?: '{}', true);
    return is_array($data) ? $data : [];
}

function text_length(string $value): int {
    return function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);
}

function require_csrf(): void {
    $token = (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    if ($token === '' || !hash_equals((string)($_SESSION['csrf'] ?? ''), $token)) {
        json_response(['ok' => false, 'message' => 'Сессия устарела. Обновите страницу.'], 419);
    }
}

function client_key(): string {
    return hash('sha256', (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
}

function rate_limit(PDO $pdo, string $action, int $limit, int $seconds): void {
    $key = client_key();
    $stmt = $pdo->prepare('SELECT attempts, window_started_at FROM rate_limits WHERE key_hash=? AND action_name=?');
    $stmt->execute([$key, $action]);
    $row = $stmt->fetch();

    if (!$row) {
        $pdo->prepare('INSERT INTO rate_limits(key_hash, action_name, attempts, window_started_at) VALUES(?,?,1,NOW())')
            ->execute([$key, $action]);
        return;
    }

    $started = strtotime((string)$row['window_started_at']) ?: 0;
    if ((time() - $started) >= $seconds) {
        $pdo->prepare('UPDATE rate_limits SET attempts=1, window_started_at=NOW() WHERE key_hash=? AND action_name=?')
            ->execute([$key, $action]);
        return;
    }

    if ((int)$row['attempts'] >= $limit) {
        json_response(['ok' => false, 'message' => 'Слишком много попыток. Попробуйте позже.'], 429);
    }

    $pdo->prepare('UPDATE rate_limits SET attempts=attempts+1 WHERE key_hash=? AND action_name=?')
        ->execute([$key, $action]);
}

function user_by_id(PDO $pdo, int $id): ?array {
    $stmt = $pdo->prepare('SELECT id,name,email,email_verified_at,notify_updates,is_admin,created_at FROM users WHERE id=? LIMIT 1');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function require_user(PDO $pdo): array {
    $id = (int)($_SESSION['user_id'] ?? 0);
    if (!$id) {
        json_response(['ok' => false, 'message' => 'Требуется вход в аккаунт.'], 401);
    }

    $user = user_by_id($pdo, $id);
    if (!$user) {
        $_SESSION = [];
        json_response(['ok' => false, 'message' => 'Аккаунт не найден.'], 401);
    }
    return $user;
}

function require_admin(PDO $pdo): array {
    $user = require_user($pdo);
    if (!(bool)$user['is_admin']) {
        json_response(['ok' => false, 'message' => 'Нет прав администратора.'], 403);
    }
    return $user;
}

function analytics_visitor_hash(array $config, string $provided = ''): string {
    $seed = trim($provided);
    if ($seed === '' || strlen($seed) > 160) {
        $seed = (string)($_SERVER['REMOTE_ADDR'] ?? '') . '|' . (string)($_SERVER['HTTP_USER_AGENT'] ?? '');
    }
    $key = (string)($config['app_key'] ?? 'fieryledlamp');
    return hash_hmac('sha256', $seed, $key);
}

function analytics_country(PDO $pdo, string $visitorHash): array {
    try {
        $stmt = $pdo->prepare('SELECT country_code,country_name FROM analytics_geo_cache WHERE visitor_hash=? LIMIT 1');
        $stmt->execute([$visitorHash]);
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
    $isPublicIp = $ip !== ''
        && filter_var($ip, FILTER_VALIDATE_IP)
        && filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE);

    if ($isPublicIp && function_exists('curl_init')) {
        $ch = curl_init('https://ipwho.is/' . rawurlencode($ip) . '?fields=success,country,country_code');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 3,
            CURLOPT_CONNECTTIMEOUT => 2,
            CURLOPT_USERAGENT => 'FieryLedLamp-Stats/1.0',
        ]);
        $raw = curl_exec($ch);
        $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode >= 200 && $httpCode < 300 && is_string($raw) && $raw !== '') {
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
        $stmt->execute([$visitorHash, $code, $name]);
    } catch (Throwable $e) {}

    return [$code, $name];
}

function record_analytics_event(PDO $pdo, array $config, string $eventType, string $item = '', string $path = '', string $visitorId = ''): void {
    $allowed = [
        'page_view',
        'firmware_page_view',
        'registration',
        'firmware_download',
        'app_windows_download',
        'app_ios_download',
        'app_android_click',
    ];
    if (!in_array($eventType, $allowed, true)) return;

    $item = substr(trim($item), 0, 80);
    $path = substr(trim($path), 0, 255);
    $visitorHash = analytics_visitor_hash($config, $visitorId);

    try {
        [$countryCode, $countryName] = analytics_country($pdo, $visitorHash);

        $stmt = $pdo->prepare('INSERT INTO analytics_counters(stat_date,event_type,item,path,country_code,country_name,event_count) VALUES(CURDATE(),?,?,?,?,?,1) ON DUPLICATE KEY UPDATE event_count=event_count+1,country_name=VALUES(country_name)');
        $stmt->execute([$eventType, $item, $path, $countryCode, $countryName]);

        if ($eventType === 'page_view' || $eventType === 'firmware_page_view') {
            $stmt = $pdo->prepare('INSERT IGNORE INTO analytics_unique_visitors(stat_date,visitor_hash,country_code,country_name) VALUES(CURDATE(),?,?,?)');
            $stmt->execute([$visitorHash, $countryCode, $countryName]);
        }
    } catch (Throwable $e) {
        // Statistics must never break registration, downloads, or the public site.
    }
}

function track_public_event(PDO $pdo, array $config): never {
    $d = input_json();
    $event = (string)($d['event'] ?? '');
    if (!in_array($event, ['page_view','firmware_page_view','firmware_download'], true)) {
        json_response(['ok' => false, 'message' => 'Некорректное событие.'], 422);
    }

    record_analytics_event(
        $pdo,
        $config,
        $event,
        (string)($d['item'] ?? ''),
        (string)($d['path'] ?? ''),
        (string)($d['visitorId'] ?? '')
    );
    json_response(['ok' => true]);
}

function track_pixel_event(PDO $pdo, array $config): never {
    $event = (string)($_GET['event'] ?? '');
    if (!in_array($event, ['page_view','firmware_page_view','firmware_download'], true)) {
        http_response_code(204);
        exit;
    }

    record_analytics_event(
        $pdo,
        $config,
        $event,
        (string)($_GET['item'] ?? ''),
        (string)($_GET['path'] ?? ''),
        (string)($_GET['visitorId'] ?? '')
    );

    header('Content-Type: image/gif');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    echo base64_decode('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==');
    exit;
}

function track_download_and_redirect(PDO $pdo, array $config): never {
    $file = (string)($_GET['file'] ?? '');
    $map = [
        'windows' => ['app_windows_download', app_url($config) . '/Fiery%20Lamp%20Control/FieryLampControl.exe'],
        'ios' => ['app_ios_download', app_url($config) . '/Fiery%20Lamp%20Control/FieryLampControl.ipa'],
        'android' => ['app_android_click', 'https://www.rustore.ru/catalog/app/com.mishanyats.fierylampcontrol'],
    ];
    if (!isset($map[$file])) {
        http_response_code(404);
        exit;
    }

    [$event, $target] = $map[$file];
    record_analytics_event($pdo, $config, $event, $file, '/fiery-lamp-control.html', '');
    header('Location: ' . $target, true, 302);
    exit;
}

function analytics_sum(PDO $pdo, string $eventType): int {
    $stmt = $pdo->prepare('SELECT COALESCE(SUM(event_count),0) FROM analytics_counters WHERE event_type=?');
    $stmt->execute([$eventType]);
    return (int)$stmt->fetchColumn();
}

function admin_users(PDO $pdo): never {
    require_admin($pdo);

    $query = trim((string)($_GET['q'] ?? ''));
    $filter = (string)($_GET['filter'] ?? 'all');
    $sort = (string)($_GET['sort'] ?? 'newest');

    $allowedFilters = ['all','verified','unverified','subscribed','admin'];
    if (!in_array($filter, $allowedFilters, true)) $filter = 'all';

    $orderMap = [
        'newest' => 'created_at DESC, id DESC',
        'oldest' => 'created_at ASC, id ASC',
        'name' => 'name ASC, id DESC',
        'email' => 'email ASC, id DESC',
    ];
    if (!isset($orderMap[$sort])) $sort = 'newest';

    $where = [];
    $params = [];

    if ($query !== '') {
        $where[] = '(name LIKE ? OR email LIKE ?)';
        $like = '%' . $query . '%';
        $params[] = $like;
        $params[] = $like;
    }

    switch ($filter) {
        case 'verified':
            $where[] = 'email_verified_at IS NOT NULL';
            break;
        case 'unverified':
            $where[] = 'email_verified_at IS NULL';
            break;
        case 'subscribed':
            $where[] = 'notify_updates=1';
            break;
        case 'admin':
            $where[] = 'is_admin=1';
            break;
    }

    $sql = 'SELECT id,name,email,email_verified_at,notify_updates,is_admin,created_at,updated_at FROM users';
    if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
    $sql .= ' ORDER BY ' . $orderMap[$sort] . ' LIMIT 500';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    $users = array_map(static function(array $row): array {
        return [
            'id' => (int)$row['id'],
            'name' => (string)$row['name'],
            'email' => (string)$row['email'],
            'verified' => $row['email_verified_at'] !== null,
            'verifiedAt' => $row['email_verified_at'],
            'notifyUpdates' => (bool)$row['notify_updates'],
            'isAdmin' => (bool)$row['is_admin'],
            'createdAt' => (string)$row['created_at'],
            'updatedAt' => (string)$row['updated_at'],
        ];
    }, $rows);

    $counts = [
        'all' => (int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn(),
        'verified' => (int)$pdo->query('SELECT COUNT(*) FROM users WHERE email_verified_at IS NOT NULL')->fetchColumn(),
        'unverified' => (int)$pdo->query('SELECT COUNT(*) FROM users WHERE email_verified_at IS NULL')->fetchColumn(),
        'subscribed' => (int)$pdo->query('SELECT COUNT(*) FROM users WHERE notify_updates=1')->fetchColumn(),
        'admins' => (int)$pdo->query('SELECT COUNT(*) FROM users WHERE is_admin=1')->fetchColumn(),
    ];

    json_response([
        'ok' => true,
        'users' => $users,
        'count' => count($users),
        'counts' => $counts,
        'filter' => $filter,
        'sort' => $sort,
    ]);
}

function admin_stats(PDO $pdo): never {
    require_admin($pdo);

    $days = (int)($_GET['days'] ?? 30);
    if (!in_array($days, [7,30,90,365], true)) $days = 30;
    $from = date('Y-m-d', time() - (($days - 1) * 86400));

    try {
        $totals = [
            'pageViews' => analytics_sum($pdo, 'page_view'),
            'flasherViews' => analytics_sum($pdo, 'firmware_page_view'),
            'firmwareDownloads' => analytics_sum($pdo, 'firmware_download'),
            'windowsDownloads' => analytics_sum($pdo, 'app_windows_download'),
            'iosDownloads' => analytics_sum($pdo, 'app_ios_download'),
            'androidClicks' => analytics_sum($pdo, 'app_android_click'),
            'registrations' => (int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn(),
            'verifiedUsers' => (int)$pdo->query('SELECT COUNT(*) FROM users WHERE email_verified_at IS NOT NULL')->fetchColumn(),
            'subscribers' => (int)$pdo->query('SELECT COUNT(*) FROM users WHERE email_verified_at IS NOT NULL AND notify_updates=1')->fetchColumn(),
            'uniqueVisitors' => (int)$pdo->query('SELECT COUNT(DISTINCT visitor_hash) FROM analytics_unique_visitors')->fetchColumn(),
        ];

        $stmt = $pdo->prepare("SELECT stat_date,event_type,SUM(event_count) AS cnt
            FROM analytics_counters
            WHERE stat_date>=? AND event_type IN ('page_view','firmware_page_view','registration','firmware_download','app_windows_download','app_ios_download','app_android_click')
            GROUP BY stat_date,event_type ORDER BY stat_date");
        $stmt->execute([$from]);
        $rows = $stmt->fetchAll();

        $daily = [];
        for ($i = 0; $i < $days; $i++) {
            $date = date('Y-m-d', strtotime($from . ' +' . $i . ' days'));
            $daily[$date] = ['date'=>$date,'visits'=>0,'registrations'=>0,'firmware'=>0,'apps'=>0];
        }
        foreach ($rows as $row) {
            $date = (string)$row['stat_date'];
            if (!isset($daily[$date])) continue;
            $count = (int)$row['cnt'];
            switch ((string)$row['event_type']) {
                case 'page_view':
                case 'firmware_page_view':
                    $daily[$date]['visits'] += $count;
                    break;
                case 'registration':
                    $daily[$date]['registrations'] += $count;
                    break;
                case 'firmware_download':
                    $daily[$date]['firmware'] += $count;
                    break;
                case 'app_windows_download':
                case 'app_ios_download':
                case 'app_android_click':
                    $daily[$date]['apps'] += $count;
                    break;
            }
        }

        $stmt = $pdo->prepare("SELECT country_code,country_name,SUM(event_count) AS cnt
            FROM analytics_counters
            WHERE stat_date>=? AND event_type IN ('page_view','firmware_page_view')
            GROUP BY country_code,country_name ORDER BY cnt DESC LIMIT 15");
        $stmt->execute([$from]);
        $countries = $stmt->fetchAll();

        $stmt = $pdo->prepare("SELECT country_code,country_name,SUM(event_count) AS cnt
            FROM analytics_counters
            WHERE stat_date>=? AND event_type='registration'
            GROUP BY country_code,country_name ORDER BY cnt DESC LIMIT 15");
        $stmt->execute([$from]);
        $registrationCountries = $stmt->fetchAll();

        $stmt = $pdo->prepare("SELECT path,SUM(event_count) AS cnt
            FROM analytics_counters
            WHERE stat_date>=? AND event_type='page_view' AND path<>''
            GROUP BY path ORDER BY cnt DESC LIMIT 15");
        $stmt->execute([$from]);
        $topPages = $stmt->fetchAll();

        $stmt = $pdo->prepare('SELECT COUNT(DISTINCT visitor_hash) FROM analytics_unique_visitors WHERE stat_date>=?');
        $stmt->execute([$from]);
        $periodUnique = (int)$stmt->fetchColumn();

        $stmt = $pdo->prepare("SELECT COALESCE(SUM(event_count),0) FROM analytics_counters WHERE stat_date>=? AND event_type IN ('page_view','firmware_page_view')");
        $stmt->execute([$from]);
        $periodVisits = (int)$stmt->fetchColumn();

        $stmt = $pdo->prepare('SELECT COUNT(*) FROM users WHERE created_at>=?');
        $stmt->execute([$from . ' 00:00:00']);
        $periodRegistrations = (int)$stmt->fetchColumn();

        json_response([
            'ok' => true,
            'days' => $days,
            'from' => $from,
            'totals' => $totals,
            'period' => [
                'visits' => $periodVisits,
                'uniqueVisitors' => $periodUnique,
                'registrations' => $periodRegistrations,
            ],
            'daily' => array_values($daily),
            'countries' => $countries,
            'registrationCountries' => $registrationCountries,
            'topPages' => $topPages,
            'privacy' => 'IP-адреса не сохраняются. Для определения страны IP передаётся сервису ipwho.is и кэшируется только страна.',
        ]);
    } catch (Throwable $e) {
        json_response([
            'ok' => false,
            'message' => 'Таблицы статистики ещё не созданы. Импортируйте server/stats_migration.sql в базу fieryledlamp.',
        ], 503);
    }
}

function issue_token(PDO $pdo, int $userId, string $type, int $ttl): string {
    $raw = bin2hex(random_bytes(32));
    $hash = hash('sha256', $raw);
    $expires = date('Y-m-d H:i:s', time() + $ttl);

    $pdo->prepare('DELETE FROM auth_tokens WHERE user_id=? AND token_type=? AND used_at IS NULL')
        ->execute([$userId, $type]);

    $pdo->prepare('INSERT INTO auth_tokens(user_id,token_type,token_hash,expires_at) VALUES(?,?,?,?)')
        ->execute([$userId, $type, $hash, $expires]);

    return $raw;
}

function consume_token(PDO $pdo, string $raw, string $type): ?int {
    if (!preg_match('/^[a-f0-9]{64}$/i', $raw)) {
        return null;
    }

    $hash = hash('sha256', $raw);
    $stmt = $pdo->prepare('SELECT id,user_id FROM auth_tokens WHERE token_hash=? AND token_type=? AND used_at IS NULL AND expires_at>NOW() LIMIT 1');
    $stmt->execute([$hash, $type]);
    $row = $stmt->fetch();

    if (!$row) {
        return null;
    }

    $pdo->prepare('UPDATE auth_tokens SET used_at=NOW() WHERE id=?')->execute([(int)$row['id']]);
    return (int)$row['user_id'];
}

function app_url(array $config): string {
    return rtrim((string)($config['app_url'] ?? 'https://fieryledlamp.ru'), '/');
}

function send_email(array $config, string $to, string $subject, string $html): bool {
    $provider = (string)($config['mail_provider'] ?? 'mail');

    if ($provider === 'resend') {
        $key = (string)($config['resend_api_key'] ?? '');
        $from = (string)($config['mail_from'] ?? 'FieryLedLamp <updates@fieryledlamp.ru>');
        if ($key === '' || !function_exists('curl_init')) {
            return false;
        }

        $ch = curl_init('https://api.resend.com/emails');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => [
                'Authorization: Bearer ' . $key,
                'Content-Type: application/json',
            ],
            CURLOPT_POSTFIELDS => json_encode([
                'from' => $from,
                'to' => [$to],
                'subject' => $subject,
                'html' => $html,
            ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            CURLOPT_TIMEOUT => 20,
        ]);
        curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        return $code >= 200 && $code < 300;
    }

    $fromEmail = (string)($config['mail_from_email'] ?? 'updates@fieryledlamp.ru');
    $fromName = (string)($config['mail_from_name'] ?? 'FieryLedLamp');
    $headers = implode("\r\n", [
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=UTF-8',
        'From: ' . $fromName . ' <' . $fromEmail . '>',
    ]);
    $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
    return @mail($to, $encodedSubject, $html, $headers);
}

function email_layout(string $title, string $body, string $buttonText = '', string $buttonUrl = ''): string {
    $button = '';
    if ($buttonUrl !== '') {
        $button = '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0 8px"><tr><td style="border-radius:10px;background:#ff6b2c"><a href="' . htmlspecialchars($buttonUrl, ENT_QUOTES) . '" style="display:inline-block;padding:13px 20px;color:#ffffff!important;text-decoration:none;font-size:16px;line-height:20px;font-weight:700;border-radius:10px"> ' . htmlspecialchars($buttonText, ENT_QUOTES) . ' </a></td></tr></table>';
    }

    return '<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="dark light"><meta name="supported-color-schemes" content="dark light"></head><body style="margin:0;padding:0;background:#0b0d12;color:#eef1f5;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#0b0d12"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="620" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:620px;background:#141923;border:1px solid #303949;border-radius:18px"><tr><td style="padding:28px;color:#eef1f5"><div style="color:#ff8d55!important;font-size:16px;line-height:22px;font-weight:700;margin-bottom:12px">FieryLedLamp</div><h1 style="margin:0 0 20px;color:#f7f8fa!important;font-family:Arial,Helvetica,sans-serif;font-size:28px;line-height:34px;font-weight:800">' . htmlspecialchars($title, ENT_QUOTES) . '</h1><div style="color:#cbd5e1!important;font-size:16px;line-height:25px">' . $body . '</div>' . $button . '<div style="margin-top:30px;padding-top:18px;border-top:1px solid #2b3442;color:#7f8b9b!important;font-size:12px;line-height:18px">fieryledlamp.ru</div></td></tr></table></td></tr></table></body></html>';
}

function register_user(PDO $pdo, array $config): never {
    rate_limit($pdo, 'register', 5, 900);
    $d = input_json();

    if (!empty($d['website'])) {
        json_response(['ok' => true, 'emailSent' => true]);
    }

    $name = trim((string)($d['name'] ?? ''));
    $email = strtolower(trim((string)($d['email'] ?? '')));
    $password = (string)($d['password'] ?? '');
    $notify = !empty($d['notifyUpdates']) ? 1 : 0;

    if (text_length($name) < 2 || text_length($name) > 80) {
        json_response(['ok' => false, 'message' => 'Укажите имя от 2 до 80 символов.'], 422);
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 190) {
        json_response(['ok' => false, 'message' => 'Укажите корректный e-mail.'], 422);
    }
    if (strlen($password) < 8 || strlen($password) > 200) {
        json_response(['ok' => false, 'message' => 'Пароль должен содержать не менее 8 символов.'], 422);
    }

    $stmt = $pdo->prepare('SELECT id FROM users WHERE email=? LIMIT 1');
    $stmt->execute([$email]);
    if ($stmt->fetch()) {
        json_response(['ok' => false, 'message' => 'Аккаунт с таким e-mail уже существует.'], 409);
    }

    $hash = password_hash($password, PASSWORD_DEFAULT);
    $pdo->prepare('INSERT INTO users(name,email,password_hash,notify_updates) VALUES(?,?,?,?)')
        ->execute([$name, $email, $hash, $notify]);

    $id = (int)$pdo->lastInsertId();
    record_analytics_event(
        $pdo,
        $config,
        'registration',
        '',
        '/register.html',
        (string)($d['visitorId'] ?? '')
    );
    $_SESSION['user_id'] = $id;
    session_regenerate_id(true);

    $token = issue_token($pdo, $id, 'verify', 86400);
    $url = app_url($config) . '/api/index.php?action=verify-email&token=' . urlencode($token);
    $body = '<p style="color:#aeb7c4;line-height:1.6">Здравствуйте, ' . htmlspecialchars($name, ENT_QUOTES) . '! Нажмите кнопку, чтобы подтвердить e-mail для аккаунта FieryLedLamp.</p>';
    $sent = send_email($config, $email, 'Подтверждение e-mail — FieryLedLamp', email_layout('Подтвердите e-mail', $body, 'Подтвердить e-mail', $url));

    json_response(['ok' => true, 'emailSent' => $sent]);
}

function login_user(PDO $pdo): never {
    rate_limit($pdo, 'login', 10, 900);
    $d = input_json();
    $email = strtolower(trim((string)($d['email'] ?? '')));
    $password = (string)($d['password'] ?? '');

    $stmt = $pdo->prepare('SELECT id,password_hash FROM users WHERE email=? LIMIT 1');
    $stmt->execute([$email]);
    $row = $stmt->fetch();

    if (!$row || !password_verify($password, (string)$row['password_hash'])) {
        json_response(['ok' => false, 'message' => 'Неверный e-mail или пароль.'], 401);
    }

    $_SESSION['user_id'] = (int)$row['id'];
    session_regenerate_id(true);
    json_response(['ok' => true, 'csrf' => $_SESSION['csrf']]);
}

function logout_user(): never {
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        setcookie(session_name(), '', [
            'expires' => time() - 42000,
            'path' => '/',
            'secure' => true,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }
    session_destroy();
    json_response(['ok' => true]);
}

function current_user_response(PDO $pdo): never {
    $u = require_user($pdo);
    json_response([
        'ok' => true,
        'csrf' => $_SESSION['csrf'],
        'user' => [
            'name' => $u['name'],
            'email' => $u['email'],
            'verified' => !empty($u['email_verified_at']),
            'notifyUpdates' => (bool)$u['notify_updates'],
            'isAdmin' => (bool)$u['is_admin'],
            'createdAt' => date('d.m.Y', strtotime((string)$u['created_at'])),
        ],
    ]);
}

function update_preferences(PDO $pdo): never {
    $u = require_user($pdo);
    $d = input_json();
    $notify = !empty($d['notifyUpdates']) ? 1 : 0;
    $pdo->prepare('UPDATE users SET notify_updates=?, updated_at=NOW() WHERE id=?')
        ->execute([$notify, (int)$u['id']]);
    json_response(['ok' => true]);
}

function resend_verification(PDO $pdo, array $config): never {
    rate_limit($pdo, 'resend', 5, 3600);
    $u = require_user($pdo);

    if (!empty($u['email_verified_at'])) {
        json_response(['ok' => true, 'message' => 'E-mail уже подтверждён.']);
    }

    $token = issue_token($pdo, (int)$u['id'], 'verify', 86400);
    $url = app_url($config) . '/api/index.php?action=verify-email&token=' . urlencode($token);
    $body = '<p style="color:#aeb7c4;line-height:1.6">Нажмите кнопку, чтобы подтвердить e-mail для аккаунта FieryLedLamp.</p>';

    if (!send_email($config, (string)$u['email'], 'Подтверждение e-mail — FieryLedLamp', email_layout('Подтвердите e-mail', $body, 'Подтвердить e-mail', $url))) {
        json_response(['ok' => false, 'message' => 'Не удалось отправить письмо.'], 503);
    }

    json_response(['ok' => true, 'message' => 'Письмо подтверждения отправлено.']);
}

function verify_email(PDO $pdo, array $config): never {
    $id = consume_token($pdo, (string)($_GET['token'] ?? ''), 'verify');
    if (!$id) {
        header('Location: ' . app_url($config) . '/login.html?verified=0');
        exit;
    }

    $pdo->prepare('UPDATE users SET email_verified_at=COALESCE(email_verified_at,NOW()), updated_at=NOW() WHERE id=?')
        ->execute([$id]);

    header('Location: ' . app_url($config) . '/login.html?verified=1');
    exit;
}

function request_reset(PDO $pdo, array $config): never {
    rate_limit($pdo, 'reset-request', 5, 3600);
    $d = input_json();
    $email = strtolower(trim((string)($d['email'] ?? '')));
    $message = 'Если аккаунт существует, на e-mail отправлена ссылка восстановления.';

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        json_response(['ok' => true, 'message' => $message]);
    }

    $stmt = $pdo->prepare('SELECT id,email FROM users WHERE email=? LIMIT 1');
    $stmt->execute([$email]);
    $u = $stmt->fetch();

    if ($u) {
        $token = issue_token($pdo, (int)$u['id'], 'reset', 3600);
        $url = app_url($config) . '/reset-password.html?token=' . urlencode($token);
        $body = '<p style="color:#aeb7c4;line-height:1.6">Получен запрос на восстановление пароля. Ссылка действует 1 час.</p>';
        send_email($config, (string)$u['email'], 'Восстановление пароля — FieryLedLamp', email_layout('Новый пароль', $body, 'Создать новый пароль', $url));
    }

    json_response(['ok' => true, 'message' => $message]);
}

function reset_password(PDO $pdo): never {
    rate_limit($pdo, 'reset-password', 8, 3600);
    $d = input_json();
    $token = (string)($d['token'] ?? '');
    $password = (string)($d['password'] ?? '');

    if (strlen($password) < 8 || strlen($password) > 200) {
        json_response(['ok' => false, 'message' => 'Пароль должен содержать не менее 8 символов.'], 422);
    }

    $id = consume_token($pdo, $token, 'reset');
    if (!$id) {
        json_response(['ok' => false, 'message' => 'Ссылка недействительна или срок её действия истёк.'], 422);
    }

    $pdo->prepare('UPDATE users SET password_hash=?, updated_at=NOW() WHERE id=?')
        ->execute([password_hash($password, PASSWORD_DEFAULT), $id]);

    $pdo->prepare("UPDATE auth_tokens SET used_at=NOW() WHERE user_id=? AND token_type='reset' AND used_at IS NULL")
        ->execute([$id]);

    json_response(['ok' => true]);
}

function unsubscribe_token(array $config, int $id, string $email): string {
    return hash_hmac('sha256', $id . '|' . $email, (string)$config['app_key']);
}

function unsubscribe(PDO $pdo, array $config): never {
    $id = (int)($_GET['id'] ?? 0);
    $token = (string)($_GET['token'] ?? '');
    $u = user_by_id($pdo, $id);

    if (!$u || !hash_equals(unsubscribe_token($config, $id, (string)$u['email']), $token)) {
        http_response_code(400);
        echo 'Некорректная ссылка.';
        exit;
    }

    $pdo->prepare('UPDATE users SET notify_updates=0, updated_at=NOW() WHERE id=?')->execute([$id]);
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><meta charset="utf-8"><title>Подписка отключена</title><body style="font-family:Arial;background:#0b0d12;color:#fff;padding:40px"><h1>Уведомления отключены</h1><p>Письма об обновлениях для этого аккаунта больше не отправляются.</p><p><a style="color:#ff8d55" href="' . htmlspecialchars(app_url($config), ENT_QUOTES) . '">Вернуться на сайт</a></p></body>';
    exit;
}

function email_configured(array $config): bool {
    $provider = (string)($config['mail_provider'] ?? 'mail');
    return $provider === 'mail' || ($provider === 'resend' && !empty($config['resend_api_key']));
}

function admin_providers(PDO $pdo, array $config): never {
    require_admin($pdo);
    $count = (int)$pdo->query('SELECT COUNT(*) FROM users WHERE email_verified_at IS NOT NULL AND notify_updates=1')->fetchColumn();
    json_response([
        'ok' => true,
        'emailConfigured' => email_configured($config),
        'subscribers' => $count,
    ]);
}

function admin_notify(PDO $pdo, array $config): never {
    require_admin($pdo);

    if (!email_configured($config)) {
        json_response(['ok' => false, 'message' => 'E-mail провайдер не настроен.'], 503);
    }

    $d = input_json();
    $version = trim((string)($d['version'] ?? ''));
    $title = trim((string)($d['title'] ?? ''));
    $summary = trim((string)($d['summary'] ?? ''));
    $url = trim((string)($d['url'] ?? ''));
    $dry = !empty($d['dryRun']);

    if ($version === '' || text_length($version) > 80) {
        json_response(['ok' => false, 'message' => 'Укажите версию.'], 422);
    }
    if ($title === '') {
        $title = 'FieryLedLamp — доступно обновление ' . $version;
    }
    if (!filter_var($url, FILTER_VALIDATE_URL) || stripos($url, 'https://') !== 0) {
        json_response(['ok' => false, 'message' => 'Укажите корректную HTTPS-ссылку.'], 422);
    }

    $users = $pdo->query('SELECT id,name,email FROM users WHERE email_verified_at IS NOT NULL AND notify_updates=1 ORDER BY id')->fetchAll();

    if ($dry) {
        json_response(['ok' => true, 'planned' => count($users)]);
    }

    $sent = 0;
    $failed = 0;
    $skipped = 0;

    foreach ($users as $u) {
        $check = $pdo->prepare('SELECT id FROM notification_log WHERE user_id=? AND version=? AND status="sent" LIMIT 1');
        $check->execute([(int)$u['id'], $version]);
        if ($check->fetch()) {
            $skipped++;
            continue;
        }

        $unsub = app_url($config) . '/api/index.php?action=unsubscribe&id=' . (int)$u['id'] . '&token=' . urlencode(unsubscribe_token($config, (int)$u['id'], (string)$u['email']));
        $body = '<p style="color:#aeb7c4;line-height:1.6">Здравствуйте, ' . htmlspecialchars((string)$u['name'], ENT_QUOTES) . '!</p><p style="color:#aeb7c4;line-height:1.6">' . nl2br(htmlspecialchars($summary !== '' ? $summary : 'Доступна новая версия FieryLedLamp.', ENT_QUOTES)) . '</p><p style="color:#7e8998;font-size:12px">Не хотите получать письма? <a style="color:#ff9d69" href="' . htmlspecialchars($unsub, ENT_QUOTES) . '">Отключить уведомления</a>.</p>';

        $ok = send_email($config, (string)$u['email'], $title, email_layout($version, $body, 'Открыть обновление', $url));

        $log = $pdo->prepare('INSERT INTO notification_log(user_id,version,status,error_text,sent_at) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE status=VALUES(status),error_text=VALUES(error_text),sent_at=VALUES(sent_at)');
        $log->execute([
            (int)$u['id'],
            $version,
            $ok ? 'sent' : 'failed',
            $ok ? null : 'mail provider error',
            $ok ? date('Y-m-d H:i:s') : null,
        ]);

        if ($ok) {
            $sent++;
        } else {
            $failed++;
        }
    }

    json_response(['ok' => true, 'sent' => $sent, 'failed' => $failed, 'skipped' => $skipped]);
}

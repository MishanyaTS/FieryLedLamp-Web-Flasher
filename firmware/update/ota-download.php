<?php
declare(strict_types=1);

// Download gateway for OTA firmware updates.
// The ESP32 firmware must request /new_version/ota-download.php?version=8.0
// rather than a static ZIP URL to make per-version OTA counting possible.
$version = trim((string)($_GET['version'] ?? ''));
if (!preg_match('/^v?[0-9]+(?:\\.[0-9]+){0,3}$/D', $version)) {
    http_response_code(400);
    exit('Invalid firmware version');
}

$root = __DIR__ . '/update';
$zipPath = $root . '/' . $version . '/update.zip';

// Backward compatible location for the currently published OTA release.
if (!is_file($zipPath)) {
    $versionFile = $root . '/version.txt';
    $current = '';
    if (is_file($versionFile)) {
        $lines = file($versionFile, FILE_IGNORE_NEW_LINES);
        foreach ($lines ?: [] as $line) {
            $line = trim((string)$line);
            if (preg_match('/^(?:version|версия)\\s*[:=]\\s*v?([0-9]+(?:\\.[0-9]+){0,3})/iu', $line, $match)
                || preg_match('/^v?([0-9]+(?:\\.[0-9]+){0,3})(?:\\s*\\||\\s|$)/i', $line, $match)) {
                $current = $match[1];
                break;
            }
        }
    }
    if (ltrim($version, 'vV') === $current) {
        $zipPath = $root . '/update.zip';
    }
}

if (!is_file($zipPath) || !is_readable($zipPath) || filesize($zipPath) <= 0) {
    http_response_code(404);
    exit('Firmware archive not found');
}

// Use exact binary length: the ESP32 OTA ZIP reader expects Content-Length.
$size = filesize($zipPath);
if ($size === false) {
    http_response_code(500);
    exit('Cannot read firmware archive');
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'HEAD') {
    header('Content-Type: application/zip');
    header('Content-Length: ' . $size);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    http_response_code(405);
    header('Allow: GET, HEAD');
    exit;
}

// Counters are best-effort; a DB failure must never block OTA downloads.
try {
    $configPath = dirname(__DIR__, 2) . '/fieryledlamp-private/config.php';
    if (is_file($configPath)) {
        $config = require $configPath;
        if (is_array($config)) {
            $pdo = new PDO(
                (string)$config['db_dsn'],
                (string)$config['db_user'],
                (string)$config['db_password'],
                [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false,
                    PDO::ATTR_TIMEOUT => 2,
                ]
            );
            $stmt = $pdo->prepare(
                'INSERT INTO analytics_counters(stat_date,event_type,item,path,country_code,country_name,event_count) ' .
                'VALUES(CURDATE(),?,?,?,?,?,1) ' .
                'ON DUPLICATE KEY UPDATE event_count=event_count+1'
            );
            $stmt->execute([
                'firmware_ota_download',
                'v:' . ltrim($version, 'vV'),
                '/update/' . $version . '/update.zip',
                'XX',
                'Неизвестно',
            ]);
        }
    }
} catch (Throwable $error) {
    // Logging failures are intentionally ignored.
}

@ini_set('zlib.output_compression', '0');
while (ob_get_level() > 0) {
    @ob_end_clean();
}
header('Content-Type: application/zip');
header('Content-Length: ' . $size);
header('Content-Disposition: attachment; filename="update.zip"');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('X-Content-Type-Options: nosniff');
if (function_exists('set_time_limit')) {
    @set_time_limit(120);
}
$stream = fopen($zipPath, 'rb');
if ($stream === false) {
    exit;
}
fpassthru($stream);
fclose($stream);

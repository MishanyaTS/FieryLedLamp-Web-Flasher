<?php
declare(strict_types=1);

// Download the archive stored in /update/<version>/update.zip and count OTA requests.
// Designed for the ESP32-S3 updater: fixed Content-Length and raw ZIP data.
$version = trim((string)($_GET['version'] ?? ''));
if (!preg_match('/^[0-9]+(?:\.[0-9]+){0,3}$/D', $version)) {
    http_response_code(400);
    exit('Invalid firmware version');
}

$folder = __DIR__ . '/' . $version;
$archive = $folder . '/update.zip';
if (!is_file($archive) && is_file(__DIR__ . '/v' . $version . '/update.zip')) {
    $archive = __DIR__ . '/v' . $version . '/update.zip';
}
if (!is_file($archive) || !is_readable($archive)) {
    http_response_code(404);
    exit('Firmware version not found');
}

$size = filesize($archive);
if ($size === false || $size <= 0) {
    http_response_code(404);
    exit('Firmware archive is empty');
}

$method = (string)($_SERVER['REQUEST_METHOD'] ?? 'GET');
if ($method !== 'GET' && $method !== 'HEAD') {
    header('Allow: GET, HEAD');
    http_response_code(405);
    exit;
}
$stream = null;
if ($method === 'GET') {
    $stream = @fopen($archive, 'rb');
    if ($stream === false) {
        http_response_code(500);
        exit('Cannot open firmware archive');
    }

    // Same private database configuration as the existing /track.php endpoint.
    // Counting failures are never allowed to interrupt firmware downloading.
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
                        PDO::ATTR_EMULATE_PREPARES => false,
                        PDO::ATTR_TIMEOUT => 2,
                    ]
                );
                $stmt = $pdo->prepare(
                    'INSERT INTO analytics_counters ' .
                    '(stat_date,event_type,item,path,country_code,country_name,event_count) ' .
                    'VALUES(CURDATE(),?,?,?,?,?,1) ON DUPLICATE KEY UPDATE event_count=event_count+1'
                );
                $stmt->execute([
                    'firmware_ota_download',
                    'v:' . $version,
                    '/update/' . $version . '/update.zip',
                    'XX',
                    'Неизвестно',
                ]);
                unset($stmt, $pdo);
            }
        }
    } catch (Throwable $error) {
        // Analytics is optional; the response must remain valid ZIP.
    }
}

@ini_set('zlib.output_compression', '0');
while (ob_get_level() > 0) @ob_end_clean();
header('Content-Type: application/zip');
header('Content-Length: ' . $size);
header('Cache-Control: no-store, no-cache, must-revalidate');
header('X-Content-Type-Options: nosniff');
header('Content-Disposition: attachment; filename="update.zip"');
if ($method === 'HEAD') exit;

if (function_exists('set_time_limit')) @set_time_limit(180);
fpassthru($stream);
fclose($stream);

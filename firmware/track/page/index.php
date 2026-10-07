<?php
declare(strict_types=1);
require_once dirname(__DIR__, 2) . '/stats-lib.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    http_response_code(405);
    header('Allow: POST');
    exit;
}

stats_record('page_view');
http_response_code(204);

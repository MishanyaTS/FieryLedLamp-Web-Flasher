<?php
declare(strict_types=1);

function stats_root(): string {
    return __DIR__;
}

function stats_data_file(): string {
    return stats_root() . '/stats-data.php';
}

function stats_config(): array {
    $file = stats_root() . '/stats-config.php';
    if (!is_file($file)) {
        return ['user_b64' => '', 'password_sha256' => ''];
    }
    $config = require $file;
    return is_array($config) ? $config : ['user_b64' => '', 'password_sha256' => ''];
}

function stats_default_data(): array {
    return [
        'all' => ['page_view' => 0, 'firmware_download' => 0],
        'hours' => []
    ];
}

function stats_decode_payload(string $raw): array {
    $pos = strpos($raw, "\n");
    if ($pos !== false) {
        $raw = substr($raw, $pos + 1);
    }
    $data = json_decode(trim($raw), true);
    if (!is_array($data)) {
        return stats_default_data();
    }
    $data['all'] ??= ['page_view' => 0, 'firmware_download' => 0];
    $data['hours'] ??= [];
    return $data;
}

function stats_encode_payload(array $data): string {
    return "<?php exit; ?>\n" . json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

function stats_record(string $event): void {
    if (!in_array($event, ['page_view', 'firmware_download'], true)) {
        return;
    }

    $file = stats_data_file();
    $fh = fopen($file, 'c+');
    if ($fh === false) {
        return;
    }

    try {
        if (!flock($fh, LOCK_EX)) {
            return;
        }

        rewind($fh);
        $raw = stream_get_contents($fh);
        $data = stats_decode_payload(is_string($raw) ? $raw : '');

        $data['all'][$event] = (int)($data['all'][$event] ?? 0) + 1;

        $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
        $hourKey = $now->format('Y-m-d\\TH');
        $data['hours'][$hourKey] ??= ['page_view' => 0, 'firmware_download' => 0];
        $data['hours'][$hourKey][$event] = (int)($data['hours'][$hourKey][$event] ?? 0) + 1;

        $cutoff = $now->modify('-800 hours');
        foreach (array_keys($data['hours']) as $key) {
            $dt = DateTimeImmutable::createFromFormat('!Y-m-d\\TH', (string)$key, new DateTimeZone('UTC'));
            if ($dt instanceof DateTimeImmutable && $dt < $cutoff) {
                unset($data['hours'][$key]);
            }
        }

        $payload = stats_encode_payload($data);
        rewind($fh);
        ftruncate($fh, 0);
        fwrite($fh, $payload);
        fflush($fh);
        flock($fh, LOCK_UN);
    } finally {
        fclose($fh);
    }
}

function stats_read(): array {
    $file = stats_data_file();
    if (!is_file($file)) {
        return stats_default_data();
    }
    $raw = file_get_contents($file);
    return stats_decode_payload(is_string($raw) ? $raw : '');
}

function stats_window(array $data, int $hours): array {
    $result = ['page_view' => 0, 'firmware_download' => 0];
    $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
    $cutoff = $now->modify('-' . max(1, $hours) . ' hours');

    foreach (($data['hours'] ?? []) as $key => $counts) {
        $dt = DateTimeImmutable::createFromFormat('!Y-m-d\\TH', (string)$key, new DateTimeZone('UTC'));
        if (!($dt instanceof DateTimeImmutable) || $dt < $cutoff) {
            continue;
        }
        $result['page_view'] += (int)($counts['page_view'] ?? 0);
        $result['firmware_download'] += (int)($counts['firmware_download'] ?? 0);
    }
    return $result;
}

function stats_authorization(): array {
    $user = $_SERVER['PHP_AUTH_USER'] ?? '';
    $password = $_SERVER['PHP_AUTH_PW'] ?? '';

    if ($user !== '' || $password !== '') {
        return [(string)$user, (string)$password];
    }

    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (is_string($header) && str_starts_with($header, 'Basic ')) {
        $decoded = base64_decode(substr($header, 6), true);
        if (is_string($decoded) && str_contains($decoded, ':')) {
            return explode(':', $decoded, 2);
        }
    }

    return ['', ''];
}

function stats_auth_ok(): bool {
    $config = stats_config();
    $expectedUser = base64_decode((string)($config['user_b64'] ?? ''), true);
    $expectedHash = (string)($config['password_sha256'] ?? '');

    if (!is_string($expectedUser) || $expectedUser === '' || $expectedHash === '') {
        return false;
    }

    [$user, $password] = stats_authorization();
    return hash_equals($expectedUser, $user)
        && hash_equals($expectedHash, hash('sha256', $password));
}

function stats_require_auth(): void {
    $config = stats_config();
    if (($config['user_b64'] ?? '') === '' || ($config['password_sha256'] ?? '') === '') {
        http_response_code(503);
        header('Content-Type: text/plain; charset=utf-8');
        echo "Статистика не настроена. Добавьте GitHub Secrets STATS_ADMIN_USER и STATS_ADMIN_PASSWORD и запустите Deploy firmware site to HostiMan.";
        exit;
    }

    if (!stats_auth_ok()) {
        header('WWW-Authenticate: Basic realm="FieryLedLamp Stats", charset="UTF-8"');
        http_response_code(401);
        header('Content-Type: text/plain; charset=utf-8');
        echo "Требуется авторизация.";
        exit;
    }
}

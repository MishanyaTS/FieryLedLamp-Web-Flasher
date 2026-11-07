<?php
declare(strict_types=1);

// Web Flasher release list. Each numbered folder has update.zip and optionally manifest.json.
// Example: update/8.0/update.zip, update/8.0/manifest.json.
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('X-Content-Type-Options: nosniff');

$base = __DIR__;
$defaultManifest = $base . '/manifest.json';
$releases = [];

foreach (new DirectoryIterator($base) as $entry) {
    if (!$entry->isDir() || $entry->isDot() || $entry->isLink()) {
        continue;
    }

    $version = $entry->getFilename();
    if (!preg_match('/^v?[0-9]+(?:\\.[0-9]+){0,3}(?:-[A-Za-z0-9][A-Za-z0-9.-]*)?$/D', $version)) {
        continue;
    }

    $folder = $entry->getPathname();
    $zip = $folder . '/update.zip';
    $localManifest = $folder . '/manifest.json';
    $manifestPath = is_file($localManifest) ? $localManifest : $defaultManifest;

    if (!is_file($zip) || filesize($zip) === 0 || !is_file($manifestPath)) {
        continue;
    }

    $details = json_decode((string) file_get_contents($manifestPath), true);
    if (!is_array($details) || ($details['ready'] ?? true) === false ||
        empty($details['files']) || !is_array($details['files'])) {
        continue;
    }

    $segment = rawurlencode($version);
    $releases[] = [
        'version' => $version,
        'label' => 'Версия ' . $version,
        'manifestUrl' => is_file($localManifest)
            ? './update/' . $segment . '/manifest.json'
            : './update/manifest.json',
        'firmwareZipUrl' => './update/' . $segment . '/update.zip',
    ];
}

usort($releases, static function (array $left, array $right): int {
    return version_compare(ltrim($right['version'], 'vV'), ltrim($left['version'], 'vV'));
});

// Preserve the existing live package until numbered release folders are uploaded.
if (!$releases && is_file($base . '/update.zip') && is_file($defaultManifest)) {
    $releases[] = [
        'version' => 'legacy',
        'label' => 'Текущая прошивка',
        'manifestUrl' => './update/manifest.json',
        'firmwareZipUrl' => './update/update.zip',
    ];
}

echo json_encode(['versions' => $releases], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

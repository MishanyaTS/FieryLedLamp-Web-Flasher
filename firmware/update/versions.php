<?php
declare(strict_types=1);

// Web Flasher release list. Each numbered folder has update.zip and optionally manifest.json.
// Example: update/8.0/update.zip, update/8.0/manifest.json.
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('X-Content-Type-Options: nosniff');
// Public list of releases is used by the administrator statistics page.
header('Access-Control-Allow-Origin: *');

$base = __DIR__;
$defaultManifest = $base . '/manifest.json';
$releases = [];

foreach (new DirectoryIterator($base) as $entry) {
    if (!$entry->isDir() || $entry->isDot() || $entry->isLink()) {
        continue;
    }

    $version = $entry->getFilename();
    if (!preg_match('/^v?[0-9]+(?:\.[0-9]+){0,3}(?:-[A-Za-z0-9][A-Za-z0-9.-]*)?$/D', $version)) {
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
        'version' => ltrim($version, 'vV'),
        'label' => 'Версия ' . ltrim($version, 'vV'),
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

// Both Web Flasher and OTA use archives from the same /update/<version>/ directory.
$otaVersions = [];
$otaRoot = $base;
if (is_dir($otaRoot)) {
    foreach (new DirectoryIterator($otaRoot) as $entry) {
        if (!$entry->isDir() || $entry->isDot() || $entry->isLink()) continue;
        $version = $entry->getFilename();
        if (!preg_match('/^v?[0-9]+(?:\.[0-9]+){0,3}$/D', $version)) continue;
        $zip = $entry->getPathname() . '/update.zip';
        if (is_file($zip) && filesize($zip) > 0) $otaVersions[] = ltrim($version, 'vV');
    }

    // Legacy root-level update.zip can also be used during migration.
    if (is_file($otaRoot . '/update.zip') && filesize($otaRoot . '/update.zip') > 0
        && is_file($otaRoot . '/version.txt')) {
        foreach (file($otaRoot . '/version.txt', FILE_IGNORE_NEW_LINES) ?: [] as $line) {
            $line = trim((string)$line);
            if (preg_match('/^(?:version|версия)\s*[:=]\s*v?([0-9]+(?:\.[0-9]+){0,3})/iu', $line, $match)
                || preg_match('/^v?([0-9]+(?:\.[0-9]+){0,3})(?:\s*\||\s|$)/i', $line, $match)) {
                $otaVersions[] = $match[1];
                break;
            }
        }
    }
}
$otaVersions = array_values(array_unique($otaVersions));
usort($otaVersions, static fn(string $a, string $b): int => version_compare($b, $a));
echo json_encode(['versions' => $releases, 'otaVersions' => $otaVersions], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

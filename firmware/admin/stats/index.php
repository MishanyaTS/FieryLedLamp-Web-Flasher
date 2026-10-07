<?php
declare(strict_types=1);
require_once dirname(__DIR__, 2) . '/stats-lib.php';

stats_require_auth();

$data = stats_read();
$d1 = stats_window($data, 24);
$d7 = stats_window($data, 24 * 7);
$d30 = stats_window($data, 24 * 30);
$all = [
    'page_view' => (int)($data['all']['page_view'] ?? 0),
    'firmware_download' => (int)($data['all']['firmware_download'] ?? 0),
];

function h(string $value): string {
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function metric(int $value, string $label): string {
    return '<div class="metric"><b>' . $value . '</b><span>' . h($label) . '</span></div>';
}

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');
?>
<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Статистика FieryLedLamp</title>
  <style>
    :root{color-scheme:dark;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
    *{box-sizing:border-box}
    body{margin:0;background:#10131a;color:#f2f4f8}
    main{max-width:980px;margin:0 auto;padding:28px 18px 48px}
    h1{margin:0 0 6px;font-size:30px}
    .muted{color:#9ca6b7}
    .top{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:22px;flex-wrap:wrap}
    .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
    .card{background:#171b24;border:1px solid #2b3240;border-radius:16px;padding:18px}
    .card h2{font-size:15px;margin:0 0 14px;color:#cdd4df;font-weight:600}
    .metrics{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .metric{background:#10131a;border-radius:12px;padding:14px}
    .metric b{font-size:30px;display:block;margin-bottom:5px}
    .metric span{font-size:13px;color:#9ca6b7}
    .note{margin-top:18px;font-size:13px;line-height:1.55;color:#9ca6b7}
    .refresh{display:inline-block;padding:9px 13px;border-radius:10px;background:#242b38;color:#fff;text-decoration:none}
    @media(max-width:700px){.grid{grid-template-columns:1fr}.metrics{grid-template-columns:1fr 1fr}}
  </style>
</head>
<body>
<main>
  <div class="top">
    <div>
      <h1>Статистика FieryLedLamp</h1>
      <div class="muted">Приватная статистика Web Flasher на HostiMan</div>
    </div>
    <a class="refresh" href="/admin/stats/">Обновить</a>
  </div>

  <div class="grid">
    <section class="card"><h2>За 24 часа</h2><div class="metrics"><?= metric($d1['page_view'], 'Посещения') ?><?= metric($d1['firmware_download'], 'Загрузки прошивки') ?></div></section>
    <section class="card"><h2>За 7 дней</h2><div class="metrics"><?= metric($d7['page_view'], 'Посещения') ?><?= metric($d7['firmware_download'], 'Загрузки прошивки') ?></div></section>
    <section class="card"><h2>За 30 дней</h2><div class="metrics"><?= metric($d30['page_view'], 'Посещения') ?><?= metric($d30['firmware_download'], 'Загрузки прошивки') ?></div></section>
    <section class="card"><h2>За всё время</h2><div class="metrics"><?= metric($all['page_view'], 'Посещения') ?><?= metric($all['firmware_download'], 'Загрузки прошивки') ?></div></section>
  </div>

  <div class="note">
    После отказа от Cloudflare статистика хранится локально на HostiMan. Посещения считаются при открытии страницы Web Flasher, загрузки — при запросе update.zip из прошивальщика. Старые данные Cloudflare автоматически сюда не переносятся.
  </div>
</main>
</body>
</html>

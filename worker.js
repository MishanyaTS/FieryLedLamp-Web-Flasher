const DATASET = "fieryledlamp_web_stats";

function unauthorized(message = "Требуется авторизация.") {
  return new Response(message, {
    status: 401,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "WWW-Authenticate": 'Basic realm="FieryLedLamp Stats", charset="UTF-8"'
    }
  });
}

function verifyAdmin(request, env) {
  if (!env.ADMIN_USER || !env.ADMIN_PASSWORD) {
    throw new Error("Не настроены ADMIN_USER и ADMIN_PASSWORD.");
  }

  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Basic ")) return false;

  try {
    const decoded = atob(auth.slice(6));
    const separator = decoded.indexOf(":");
    if (separator < 0) return false;

    const user = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);

    return user === env.ADMIN_USER && password === env.ADMIN_PASSWORD;
  } catch (_) {
    return false;
  }
}

async function queryAnalytics(env, sql) {
  if (!env.CF_ACCOUNT_ID || !env.CF_ANALYTICS_TOKEN) {
    throw new Error("Не настроены CF_ACCOUNT_ID и CF_ANALYTICS_TOKEN.");
  }

  const api = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`;
  const response = await fetch(api, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}`,
      "Content-Type": "text/plain; charset=utf-8"
    },
    body: sql
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Analytics Engine: HTTP ${response.status}. ${details.slice(0, 300)}`);
  }

  return response.json();
}

function totalsByEvent(result) {
  const out = { page_view: 0, firmware_download: 0 };
  for (const row of result?.data || []) {
    if (row.event in out) out[row.event] = Number(row.total) || 0;
  }
  return out;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function statsHtml({ d1, d7, d30, all, countries }) {
  const countryRows = (countries?.data || [])
    .map(row => `<tr><td>${escapeHtml(row.country || "XX")}</td><td>${Number(row.total) || 0}</td></tr>`)
    .join("");

  return `<!doctype html>
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
    table{width:100%;border-collapse:collapse}
    th,td{text-align:left;padding:10px;border-bottom:1px solid #2b3240}
    th{color:#9ca6b7;font-size:12px;text-transform:uppercase}
    td:last-child,th:last-child{text-align:right}
    .note{margin-top:18px;font-size:13px;line-height:1.5;color:#9ca6b7}
    .refresh{display:inline-block;padding:9px 13px;border-radius:10px;background:#242b38;color:#fff;text-decoration:none}
    @media(max-width:700px){.grid{grid-template-columns:1fr}.metrics{grid-template-columns:1fr 1fr}}
  </style>
</head>
<body>
<main>
  <div class="top">
    <div>
      <h1>Статистика FieryLedLamp</h1>
      <div class="muted">Приватная статистика Web Flasher</div>
    </div>
    <a class="refresh" href="/admin/stats">Обновить</a>
  </div>

  <div class="grid">
    <section class="card">
      <h2>За 24 часа</h2>
      <div class="metrics">
        <div class="metric"><b>${d1.page_view}</b><span>Посещения</span></div>
        <div class="metric"><b>${d1.firmware_download}</b><span>Загрузки прошивки</span></div>
      </div>
    </section>

    <section class="card">
      <h2>За 7 дней</h2>
      <div class="metrics">
        <div class="metric"><b>${d7.page_view}</b><span>Посещения</span></div>
        <div class="metric"><b>${d7.firmware_download}</b><span>Загрузки прошивки</span></div>
      </div>
    </section>

    <section class="card">
      <h2>За 30 дней</h2>
      <div class="metrics">
        <div class="metric"><b>${d30.page_view}</b><span>Посещения</span></div>
        <div class="metric"><b>${d30.firmware_download}</b><span>Загрузки прошивки</span></div>
      </div>
    </section>

    <section class="card">
      <h2>За всё время</h2>
      <div class="metrics">
        <div class="metric"><b>${all.page_view}</b><span>Посещения</span></div>
        <div class="metric"><b>${all.firmware_download}</b><span>Загрузки прошивки</span></div>
      </div>
    </section>

    <section class="card" style="grid-column:1/-1">
      <h2>Страны посещений за 7 дней</h2>
      <table>
        <thead><tr><th>Страна</th><th>Посещения</th></tr></thead>
        <tbody>${countryRows || '<tr><td colspan="2">Пока нет данных</td></tr>'}</tbody>
      </table>
    </section>
  </div>

  <div class="note">
    «Посещения» — открытия главной страницы. «Загрузки прошивки» — запросы файла firmware/update.zip.
    Доступ к этой странице защищён логином и паролем.
  </div>
</main>
</body>
</html>`;
}

async function handleStats(request, env) {
  try {
    if (!verifyAdmin(request, env)) return unauthorized();
  } catch (error) {
    return new Response(error?.message || "Статистика не настроена.", {
      status: 503,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });
  }

  try {
    const base = `SELECT index1 AS event, SUM(_sample_interval) AS total FROM ${DATASET}`;
    const [q1, q7, q30, qAll, qCountries] = await Promise.all([
      queryAnalytics(env, `${base} WHERE timestamp > NOW() - INTERVAL '1' DAY GROUP BY index1 FORMAT JSON`),
      queryAnalytics(env, `${base} WHERE timestamp > NOW() - INTERVAL '7' DAY GROUP BY index1 FORMAT JSON`),
      queryAnalytics(env, `${base} WHERE timestamp > NOW() - INTERVAL '30' DAY GROUP BY index1 FORMAT JSON`),
      queryAnalytics(env, `${base} GROUP BY index1 FORMAT JSON`),
      queryAnalytics(env, `SELECT blob3 AS country, SUM(_sample_interval) AS total FROM ${DATASET} WHERE index1 = 'page_view' AND timestamp > NOW() - INTERVAL '7' DAY GROUP BY blob3 ORDER BY total DESC LIMIT 10 FORMAT JSON`)
    ]);

    return new Response(statsHtml({
      d1: totalsByEvent(q1),
      d7: totalsByEvent(q7),
      d30: totalsByEvent(q30),
      all: totalsByEvent(qAll),
      countries: qCountries
    }), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow"
      }
    });
  } catch (error) {
    return new Response(`Ошибка статистики: ${error?.message || error}`, {
      status: 500,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (method === "GET" && (url.pathname === "/admin/stats" || url.pathname === "/admin/stats/")) {
      return handleStats(request, env);
    }

    const isPageView =
      method === "GET" &&
      (url.pathname === "/" || url.pathname === "/index.html");

    const isFirmwareDownload =
      method === "GET" &&
      url.pathname === "/firmware/update.zip";

    if (isPageView || isFirmwareDownload) {
      try {
        env.STATS.writeDataPoint({
          indexes: [isFirmwareDownload ? "firmware_download" : "page_view"],
          blobs: [
            url.hostname,
            url.pathname,
            request.cf?.country || "XX"
          ],
          doubles: [1]
        });
      } catch (_) {
        // Ошибка статистики не должна мешать работе сайта или прошивке.
      }
    }

    return env.ASSETS.fetch(request);
  }
};

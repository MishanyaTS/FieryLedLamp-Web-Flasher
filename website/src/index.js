const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function normalizePhone(value) {
  const raw = String(value || "").trim();
  const plus = raw.startsWith("+") ? "+" : "";
  const digits = raw.replace(/\D/g, "");
  return plus + digits;
}

function validEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validPhone(value) {
  return /^\+?[0-9]{7,15}$/.test(value);
}

function token() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map(v => v.toString(16).padStart(2, "0")).join("");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function basicAuthOk(request, env) {
  if (!env.ADMIN_USER || !env.ADMIN_PASSWORD) return false;
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Basic ")) return false;

  try {
    const decoded = atob(header.slice(6));
    const pos = decoded.indexOf(":");
    if (pos < 0) return false;
    const user = decoded.slice(0, pos);
    const password = decoded.slice(pos + 1);
    return user === env.ADMIN_USER && password === env.ADMIN_PASSWORD;
  } catch {
    return false;
  }
}

function adminUnauthorized() {
  return new Response("Authorization required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="FieryLedLamp notifications"' }
  });
}

async function ensureSchema(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS subscribers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL,
      notify_email INTEGER NOT NULL DEFAULT 1,
      notify_sms INTEGER NOT NULL DEFAULT 0,
      consent INTEGER NOT NULL DEFAULT 1,
      active INTEGER NOT NULL DEFAULT 1,
      unsubscribe_token TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_subscribers_active ON subscribers(active);

    CREATE TABLE IF NOT EXISTS notification_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_key TEXT NOT NULL,
      subscriber_id INTEGER NOT NULL,
      channel TEXT NOT NULL,
      status TEXT NOT NULL,
      external_id TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(campaign_key, subscriber_id, channel)
    );
    CREATE INDEX IF NOT EXISTS idx_delivery_campaign
      ON notification_deliveries(campaign_key, status);
  `);
}

async function register(request, env) {
  if (!env.DB) {
    return json({ ok: false, error: "database_not_configured", message: "База данных регистрации ещё не подключена." }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, message: "Некорректные данные формы." }, 400);
  }

  if (String(body.website || "").trim()) {
    return json({ ok: true, message: "Регистрация сохранена." });
  }

  const email = String(body.email || "").trim().toLowerCase();
  const phone = normalizePhone(body.phone);
  const notifyEmail = body.notifyEmail === true;
  const notifySms = body.notifySms === true;
  const consent = body.consent === true;

  if (!validEmail(email)) {
    return json({ ok: false, field: "email", message: "Укажите корректный e-mail." }, 400);
  }
  if (!validPhone(phone)) {
    return json({ ok: false, field: "phone", message: "Укажите номер телефона в международном формате." }, 400);
  }
  if (!notifyEmail && !notifySms) {
    return json({ ok: false, field: "notifications", message: "Выберите хотя бы один способ уведомления." }, 400);
  }
  if (!consent) {
    return json({ ok: false, field: "consent", message: "Нужно подтвердить согласие на хранение контактных данных." }, 400);
  }

  await ensureSchema(env.DB);
  const now = new Date().toISOString();
  const unsubscribeToken = token();

  await env.DB.prepare(`
    INSERT INTO subscribers
      (email, phone, notify_email, notify_sms, consent, active, unsubscribe_token, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, 1, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      phone = excluded.phone,
      notify_email = excluded.notify_email,
      notify_sms = excluded.notify_sms,
      consent = 1,
      active = 1,
      updated_at = excluded.updated_at
  `).bind(
    email,
    phone,
    notifyEmail ? 1 : 0,
    notifySms ? 1 : 0,
    unsubscribeToken,
    now,
    now
  ).run();

  return json({
    ok: true,
    message: "Регистрация сохранена. Настройки уведомлений можно изменить повторной регистрацией с тем же e-mail."
  });
}

async function unsubscribe(request, env) {
  if (!env.DB) {
    return json({ ok: false, message: "База данных регистрации ещё не подключена." }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, message: "Некорректный запрос." }, 400);
  }

  const unsubscribeToken = String(body.token || "").trim();
  if (!/^[a-f0-9]{48}$/.test(unsubscribeToken)) {
    return json({ ok: false, message: "Некорректная ссылка отписки." }, 400);
  }

  await ensureSchema(env.DB);
  const result = await env.DB.prepare(
    "UPDATE subscribers SET active = 0, notify_email = 0, notify_sms = 0, updated_at = ? WHERE unsubscribe_token = ?"
  ).bind(new Date().toISOString(), unsubscribeToken).run();

  return json({
    ok: true,
    changed: Number(result.meta?.changes || 0) > 0,
    message: "Уведомления отключены."
  });
}

async function sendEmail(env, subscriber, message) {
  if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured");

  const from = env.RESEND_FROM || "FieryLedLamp <updates@fieryledlamp.ru>";
  const unsubscribeUrl =
    "https://fieryledlamp.ru/unsubscribe.html?token=" +
    encodeURIComponent(subscriber.unsubscribe_token);

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#16181d">
      <h1 style="font-size:26px">FieryLedLamp ${escapeHtml(message.version)}</h1>
      <p style="font-size:17px">${escapeHtml(message.summary || "Доступно новое обновление прошивки FieryLedLamp.")}</p>
      <p>
        <a href="${escapeHtml(message.url)}"
           style="display:inline-block;background:#ff6b2c;color:#fff;text-decoration:none;padding:12px 18px;border-radius:9px;font-weight:bold">
          Открыть обновление
        </a>
      </p>
      <p style="color:#6d7480;font-size:13px">Вы получили это письмо, потому что включили уведомления об обновлениях FieryLedLamp.</p>
      <p style="font-size:12px"><a href="${escapeHtml(unsubscribeUrl)}" style="color:#6d7480">Отписаться от уведомлений</a></p>
    </div>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": "Bearer " + env.RESEND_API_KEY,
      "idempotency-key": message.campaign + "/email/" + subscriber.id
    },
    body: JSON.stringify({
      from,
      to: [subscriber.email],
      subject: message.title || ("FieryLedLamp " + message.version + " — доступно обновление"),
      html
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.name || ("Resend HTTP " + response.status));
  }

  return { id: data.id || null };
}

async function sendSms(env, subscriber, message) {
  if (!env.SMSRU_API_ID) throw new Error("SMSRU_API_ID is not configured");

  const phone = String(subscriber.phone || "").replace(/\D/g, "");
  if (!phone) throw new Error("Empty phone");

  const params = new URLSearchParams({
    api_id: env.SMSRU_API_ID,
    to: phone,
    msg: "FieryLedLamp " + message.version + " доступна. Обновить: " + message.url,
    json: "1",
    daytime: "1"
  });

  if (env.SMSRU_FROM) params.set("from", env.SMSRU_FROM);

  const response = await fetch("https://sms.ru/sms/send", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: params.toString()
  });

  const data = await response.json().catch(() => ({}));
  const item = data?.sms?.[phone];

  if (!response.ok || data.status !== "OK" || !item || item.status !== "OK") {
    throw new Error(item?.status_text || data.status_text || ("SMS.RU error " + (item?.status_code || data.status_code || response.status)));
  }

  return { id: item.sms_id || null };
}

async function saveDelivery(env, campaign, subscriberId, channel, status, externalId, error) {
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO notification_deliveries
      (campaign_key, subscriber_id, channel, status, external_id, error, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(campaign_key, subscriber_id, channel) DO UPDATE SET
      status = excluded.status,
      external_id = excluded.external_id,
      error = excluded.error,
      updated_at = excluded.updated_at
  `).bind(
    campaign,
    subscriberId,
    channel,
    status,
    externalId || null,
    error || null,
    now,
    now
  ).run();
}

async function notifySubscribers(request, env) {
  if (!basicAuthOk(request, env)) return adminUnauthorized();
  if (!env.DB) return json({ ok: false, message: "D1 binding DB не подключён." }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, message: "Некорректный JSON." }, 400);
  }

  const version = String(body.version || "").trim();
  const summary = String(body.summary || "").trim();
  const title = String(body.title || "").trim();
  const updateUrl = String(body.url || "https://fieryledlamp.ru/firmware/").trim();
  const useEmail = body.email !== false;
  const useSms = body.sms === true;
  const dryRun = body.dryRun === true;

  if (!version || version.length > 80) {
    return json({ ok: false, message: "Укажите версию обновления." }, 400);
  }
  if (!/^https:\/\//i.test(updateUrl)) {
    return json({ ok: false, message: "URL обновления должен начинаться с https://." }, 400);
  }
  if (!useEmail && !useSms) {
    return json({ ok: false, message: "Выберите e-mail и/или SMS." }, 400);
  }

  await ensureSchema(env.DB);

  const campaign = String(body.campaign || ("fieryledlamp-" + version))
    .trim()
    .replace(/[^a-zA-Z0-9_.-]+/g, "-")
    .slice(0, 120);

  const query = await env.DB.prepare(`
    SELECT id, email, phone, notify_email, notify_sms, unsubscribe_token
    FROM subscribers
    WHERE active = 1
    ORDER BY id ASC
  `).all();

  const subscribers = query.results || [];
  const plan = {
    email: subscribers.filter(s => useEmail && Number(s.notify_email) === 1).length,
    sms: subscribers.filter(s => useSms && Number(s.notify_sms) === 1).length
  };

  if (dryRun) {
    return json({
      ok: true,
      dryRun: true,
      campaign,
      subscribers: subscribers.length,
      planned: plan,
      providers: {
        resend: Boolean(env.RESEND_API_KEY),
        smsru: Boolean(env.SMSRU_API_ID)
      }
    });
  }

  if (useEmail && !env.RESEND_API_KEY) {
    return json({ ok: false, message: "Не настроен RESEND_API_KEY." }, 503);
  }
  if (useSms && !env.SMSRU_API_ID) {
    return json({ ok: false, message: "Не настроен SMSRU_API_ID." }, 503);
  }

  const previous = await env.DB.prepare(`
    SELECT subscriber_id, channel
    FROM notification_deliveries
    WHERE campaign_key = ? AND status = 'sent'
  `).bind(campaign).all();

  const sentAlready = new Set(
    (previous.results || []).map(r => r.subscriber_id + ":" + r.channel)
  );

  const result = {
    ok: true,
    campaign,
    subscribers: subscribers.length,
    email: { planned: plan.email, sent: 0, skipped: 0, failed: 0 },
    sms: { planned: plan.sms, sent: 0, skipped: 0, failed: 0 }
  };

  const message = { campaign, version, summary, title, url: updateUrl };

  for (const subscriber of subscribers) {
    if (useEmail && Number(subscriber.notify_email) === 1) {
      const key = subscriber.id + ":email";
      if (sentAlready.has(key)) {
        result.email.skipped++;
      } else {
        try {
          const sent = await sendEmail(env, subscriber, message);
          await saveDelivery(env, campaign, subscriber.id, "email", "sent", sent.id, null);
          result.email.sent++;
        } catch (error) {
          await saveDelivery(env, campaign, subscriber.id, "email", "failed", null, String(error.message || error));
          result.email.failed++;
        }
      }
    }

    if (useSms && Number(subscriber.notify_sms) === 1) {
      const key = subscriber.id + ":sms";
      if (sentAlready.has(key)) {
        result.sms.skipped++;
      } else {
        try {
          const sent = await sendSms(env, subscriber, message);
          await saveDelivery(env, campaign, subscriber.id, "sms", "sent", sent.id, null);
          result.sms.sent++;
        } catch (error) {
          await saveDelivery(env, campaign, subscriber.id, "sms", "failed", null, String(error.message || error));
          result.sms.failed++;
        }
      }
    }
  }

  return json(result);
}

async function providerStatus(request, env) {
  if (!basicAuthOk(request, env)) return adminUnauthorized();

  let subscribers = null;
  if (env.DB) {
    await ensureSchema(env.DB);
    const row = await env.DB.prepare(`
      SELECT
        COUNT(*) AS active,
        SUM(CASE WHEN notify_email = 1 THEN 1 ELSE 0 END) AS email,
        SUM(CASE WHEN notify_sms = 1 THEN 1 ELSE 0 END) AS sms
      FROM subscribers
      WHERE active = 1
    `).first();

    subscribers = {
      active: Number(row?.active || 0),
      email: Number(row?.email || 0),
      sms: Number(row?.sms || 0)
    };
  }

  return json({
    ok: true,
    database: Boolean(env.DB),
    subscribers,
    email: {
      provider: "Resend",
      configured: Boolean(env.RESEND_API_KEY),
      from: env.RESEND_FROM || "FieryLedLamp <updates@fieryledlamp.ru>"
    },
    sms: {
      provider: "SMS.RU",
      configured: Boolean(env.SMSRU_API_ID),
      sender: env.SMSRU_FROM || "default"
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if ((url.pathname === "/admin/notifications" || url.pathname === "/admin/notifications/" || url.pathname === "/admin-notifications.html") && request.method === "GET") {
      if (!basicAuthOk(request, env)) return adminUnauthorized();
      const assetUrl = new URL("/admin-notifications.html", request.url);
      return env.ASSETS.fetch(new Request(assetUrl, request));
    }

    if (url.pathname === "/api/register" && request.method === "POST") {
      return register(request, env);
    }

    if (url.pathname === "/api/unsubscribe" && request.method === "POST") {
      return unsubscribe(request, env);
    }

    if (url.pathname === "/api/admin/providers" && request.method === "GET") {
      return providerStatus(request, env);
    }

    if (url.pathname === "/api/admin/notify" && request.method === "POST") {
      return notifySubscribers(request, env);
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ ok: false, message: "Метод не найден." }, 404);
    }

    return env.ASSETS.fetch(request);
  }
};

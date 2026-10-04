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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/register" && request.method === "POST") {
      return register(request, env);
    }

    if (url.pathname === "/api/unsubscribe" && request.method === "POST") {
      return unsubscribe(request, env);
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ ok: false, message: "Метод не найден." }, 404);
    }

    return env.ASSETS.fetch(request);
  }
};

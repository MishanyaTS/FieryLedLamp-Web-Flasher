(() => {
  const menu = document.querySelector(".menu-btn");
  const nav = document.querySelector("#site-nav");
  if (menu && nav) {
    menu.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      menu.setAttribute("aria-expanded", String(open));
    });
  }

  const matrix = document.querySelector("#matrixDemo");
  if (matrix) {
    const pixels = [];
    for (let i = 0; i < 256; i++) {
      const el = document.createElement("i");
      el.className = "pixel";
      matrix.appendChild(el);
      pixels.push(el);
    }
    let t = 0;
    function draw() {
      t += 0.07;
      pixels.forEach((p, i) => {
        const x = i % 16, y = Math.floor(i / 16);
        const wave = Math.sin((x + t * 8) * .55) + Math.cos((y - t * 5) * .48);
        const ring = Math.sin(Math.hypot(x - 7.5, y - 7.5) * .9 - t * 6);
        const v = (wave + ring + 3) / 6;
        const hue = 12 + Math.round(v * 32);
        const light = 13 + Math.round(v * 43);
        p.style.background = "hsl(" + hue + " 92% " + light + "%)";
        p.style.boxShadow = v > .65 ? "0 0 10px hsla(" + hue + " 100% 60% / .6)" : "none";
      });
      requestAnimationFrame(draw);
    }
    draw();
  }

  const manualSearch = document.querySelector("#manualSearch");
  if (manualSearch) {
    const sections = [...document.querySelectorAll(".manual-section")];
    const noResults = document.querySelector("#manualNoResults");
    manualSearch.addEventListener("input", () => {
      const q = manualSearch.value.trim().toLowerCase();
      let visible = 0;
      sections.forEach(section => {
        const match = !q || section.textContent.toLowerCase().includes(q);
        section.hidden = !match;
        if (match) visible++;
      });
      if (noResults) noResults.hidden = visible !== 0;
    });
  }

})();

(() => {
  const SOURCE = "/Version.txt";

  const history = document.querySelector("#versionHistory");
  const currentVersion = document.querySelector("#currentVersion");
  const latestNotes = document.querySelector("#versionLatestNotes");
  const search = document.querySelector("#versionSearch");
  const visibleCount = document.querySelector("#versionVisibleCount");
  const noResults = document.querySelector("#versionNoResults");
  const filters = [...document.querySelectorAll(".version-filter")];

  if (!history) return;

  const displayText = value => String(value).replace(/FieryLedLamp/g, "Fiery Led Lamp").replace(/[—–]/g, "-");

  const escapeHtml = value => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const isVersionHeading = line =>
    /^(?:Версия\s+)?(?:FieryLedLamp[_\s]+)?v?\d+(?:\.\d+)+(?:[_\s].*)?$/i.test(line.trim());

  function parseHistory(text) {
    const lines = text.replace(/\r/g, "").split("\n");
    const currentLine = lines.find(line => /^Текущая версия\s*:/i.test(line.trim())) || "";
    const current = currentLine.replace(/^Текущая версия\s*:\s*/i, "").trim();

    const marker = lines.findIndex(line => /ИСТОРИЯ ВЕРСИЙ/i.test(line));
    const source = marker >= 0 ? lines.slice(marker + 1) : lines;
    const versions = [];
    let version = null;

    for (const raw of source) {
      const line = raw.trim();
      if (!line) continue;

      if (isVersionHeading(line)) {
        version = { title: line, changes: [] };
        versions.push(version);
      } else if (version) {
        version.changes.push(line);
      }
    }

    return { current, versions };
  }

  function getVersionNumber(title) {
    const match = title.match(/v?(\d+(?:\.\d+)+)/i);
    return match ? "v" + match[1] : title;
  }

  function renderLatest(data) {
    const latest = data.versions[0];
    if (currentVersion) {
      currentVersion.textContent = displayText(data.current || latest?.title || "не определена");
    }
    if (!latestNotes || !latest) return;

    const items = latest.changes
      .filter(line => /^[-–—]\s*/.test(line))
      .slice(0, 3)
      .map(line => line.replace(/^[-–—]\s*/, ""));

    latestNotes.innerHTML = (items.length ? items : ["Актуальная версия прошивки Fiery Led Lamp."])
      .map(item => `<div><span>✓</span><p>${escapeHtml(displayText(item))}</p></div>`)
      .join("");
  }

  function render(data) {
    renderLatest(data);

    history.innerHTML = data.versions.map((version, index) => {
      const number = getVersionNumber(version.title);
      const subtitle = version.title
        .replace(number, "")
        .replace(/^\s*(?:Версия\s+)?FieryLedLamp[_\s]*/i, "")
        .trim();

      const changes = version.changes.map(line => {
        const bullet = /^[-–—]\s*/.test(line);
        const text = bullet ? line.replace(/^[-–—]\s*/, "") : line;
        return bullet
          ? `<li>${escapeHtml(displayText(text))}</li>`
          : `<li class="version-note-line">${escapeHtml(text)}</li>`;
      }).join("");

      const searchText = (version.title + " " + version.changes.join(" ")).toLowerCase();

      return `<article class="version-entry" data-search="${escapeHtml(searchText)}">
        <div class="version-rail">
          <span class="version-dot ${index === 0 ? "current" : ""}"></span>
          <span class="version-line"></span>
        </div>
        <details class="version-release" ${index < 2 ? "open" : ""}>
          <summary>
            <div class="version-release-main">
              <div class="version-number">${escapeHtml(number)}</div>
              <div class="version-release-title">
                <h3>${index === 0 ? "Текущая версия" : "Fiery Led Lamp"}</h3>
                ${subtitle ? `<span>${escapeHtml(subtitle)}</span>` : ""}
              </div>
            </div>
            <div class="version-release-side">
              ${index === 0 ? '<span class="version-current-badge">Текущая</span>' : ""}
              <span class="version-toggle"></span>
            </div>
          </summary>
          <div class="version-release-body"><ul>${changes}</ul></div>
        </details>
      </article>`;
    }).join("");

    applyFilter();
  }

  function applyFilter() {
    const query = (search?.value || "").trim().toLowerCase();
    const entries = [...history.querySelectorAll(".version-entry")];
    let shown = 0;

    for (const entry of entries) {
      const matches = !query || entry.dataset.search.includes(query);
      entry.hidden = !matches;
      if (matches) {
        shown++;
        if (query) entry.querySelector("details")?.setAttribute("open", "");
      }
    }

    if (visibleCount) visibleCount.textContent = `Показано: ${shown}`;
    if (noResults) noResults.hidden = shown !== 0;
  }

  search?.addEventListener("input", () => {
    filters.forEach(button => button.classList.toggle("active", button.dataset.query === ""));
    applyFilter();
  });

  filters.forEach(button => {
    button.addEventListener("click", () => {
      filters.forEach(item => item.classList.remove("active"));
      button.classList.add("active");
      if (search) search.value = button.dataset.query || "";
      applyFilter();
    });
  });

  fetch(SOURCE + "?v=" + Date.now(), { cache: "no-store" })
    .then(response => {
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.text();
    })
    .then(text => {
      const data = parseHistory(text);
      if (!data.versions.length) throw new Error("История версий не найдена");
      render(data);
    })
    .catch(error => {
      history.innerHTML = `<div class="version-state error"><b>Не удалось загрузить историю версий</b><span>${escapeHtml(error.message)}</span></div>`;
      if (currentVersion) currentVersion.textContent = "недоступна";
      if (visibleCount) visibleCount.textContent = "-";
      if (latestNotes) latestNotes.innerHTML = '<div><span>!</span><p>Источник временно недоступен.</p></div>';
      if (noResults) noResults.hidden = true;
    });
})();


(() => {
  const STORAGE_KEY = "fiery_analytics_id";
  const TRACK_URL = "/api/index.php?action=track";

  function visitorId() {
    try {
      let id = localStorage.getItem(STORAGE_KEY);
      if (!id) {
        id = globalThis.crypto?.randomUUID?.() || (Date.now().toString(36) + "-" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2));
        localStorage.setItem(STORAGE_KEY, id);
      }
      return id;
    } catch (_) {
      return "";
    }
  }

  function track(event, item = "", path = location.pathname) {
    const payload = JSON.stringify({ event, item, path, visitorId: visitorId() });
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(TRACK_URL, new Blob([payload], { type: "text/plain;charset=UTF-8" }));
        return;
      }
    } catch (_) {}
    fetch(TRACK_URL, {
      method: "POST",
      body: payload,
      headers: { "content-type": "text/plain;charset=UTF-8" },
      credentials: "same-origin",
      keepalive: true,
      cache: "no-store"
    }).catch(() => {});
  }

  window.FieryAnalytics = { id: visitorId, track };

  const excluded = [
    "/admin-stats.html",
    "/admin-notifications.html",
    "/account.html",
    "/login.html",
    "/register.html",
    "/forgot-password.html",
    "/reset-password.html"
  ];
  if (!excluded.includes(location.pathname)) track("page_view");
})();

(() => {
  const api = (action, options = {}) => fetch("/api/index.php?action=" + encodeURIComponent(action), {
    credentials: "same-origin",
    cache: "no-store",
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });

  const parse = async response => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.message || "Ошибка сервера.");
    return data;
  };

  const setStatus = (form, message, type = "") => {
    const box = form?.querySelector(".form-status");
    if (!box) return;
    box.textContent = message || "";
    box.className = "form-status" + (type ? " " + type : "");
  };

  const busy = (button, state, text = "Подождите…") => {
    if (!button) return;
    if (state) {
      button.dataset.oldText = button.textContent;
      button.textContent = text;
      button.disabled = true;
    } else {
      button.textContent = button.dataset.oldText || button.textContent;
      button.disabled = false;
    }
  };

  const params = new URLSearchParams(location.search);
  const requestedNext = params.get("next") || "";
  const nextPath = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/account.html";

  const registerForm = document.querySelector("#registerForm");
  if (registerForm) {
    registerForm.addEventListener("submit", async event => {
      event.preventDefault();
      if (registerForm.password.value !== registerForm.password2.value) {
        setStatus(registerForm, "Пароли не совпадают.", "error");
        return;
      }
      const button = registerForm.querySelector("button[type=submit]");
      busy(button, true, "Регистрация…");
      setStatus(registerForm, "");
      try {
        const data = await parse(await api("register", {
          method: "POST",
          body: JSON.stringify({
            name: registerForm.name.value.trim(),
            email: registerForm.email.value.trim(),
            password: registerForm.password.value,
            notifyUpdates: registerForm.notifyUpdates.checked,
            website: registerForm.website.value,
            visitorId: window.FieryAnalytics?.id?.() || ""
          })
        }));
        setStatus(registerForm,
          data.emailSent
            ? "Аккаунт создан. На почту отправлена ссылка подтверждения."
            : "Аккаунт создан, но письмо подтверждения отправить не удалось. Его можно отправить повторно из аккаунта.",
          data.emailSent ? "success" : "error"
        );
        setTimeout(() => location.href = nextPath, 700);
      } catch (error) {
        setStatus(registerForm, error.message, "error");
      } finally {
        busy(button, false);
      }
    });
  }

  const loginForm = document.querySelector("#loginForm");
  if (loginForm) {
    if (params.get("verified") === "1") setStatus(loginForm, "E-mail подтверждён. Теперь можно войти.", "success");
    if (params.get("verified") === "0") setStatus(loginForm, "Ссылка подтверждения недействительна или устарела.", "error");
    if (params.get("reset") === "1") setStatus(loginForm, "Пароль изменён. Войдите с новым паролем.", "success");

    loginForm.addEventListener("submit", async event => {
      event.preventDefault();
      const button = loginForm.querySelector("button[type=submit]");
      busy(button, true, "Вход…");
      try {
        await parse(await api("login", {
          method: "POST",
          body: JSON.stringify({
            email: loginForm.email.value.trim(),
            password: loginForm.password.value,
            remember: loginForm.remember?.checked === true
          })
        }));
        location.href = nextPath;
      } catch (error) {
        setStatus(loginForm, error.message, "error");
      } finally {
        busy(button, false);
      }
    });
  }

  const forgotForm = document.querySelector("#forgotForm");
  if (forgotForm) {
    forgotForm.addEventListener("submit", async event => {
      event.preventDefault();
      const button = forgotForm.querySelector("button[type=submit]");
      busy(button, true, "Отправка…");
      try {
        const data = await parse(await api("request-reset", {
          method: "POST",
          body: JSON.stringify({ email: forgotForm.email.value.trim() })
        }));
        setStatus(forgotForm, data.message, "success");
      } catch (error) {
        setStatus(forgotForm, error.message, "error");
      } finally {
        busy(button, false);
      }
    });
  }

  const resetForm = document.querySelector("#resetForm");
  if (resetForm) {
    resetForm.token.value = params.get("token") || "";
    if (!resetForm.token.value) setStatus(resetForm, "В ссылке отсутствует токен восстановления.", "error");

    resetForm.addEventListener("submit", async event => {
      event.preventDefault();
      if (resetForm.password.value !== resetForm.password2.value) {
        setStatus(resetForm, "Пароли не совпадают.", "error");
        return;
      }
      const button = resetForm.querySelector("button[type=submit]");
      busy(button, true, "Сохранение…");
      try {
        await parse(await api("reset-password", {
          method: "POST",
          body: JSON.stringify({
            token: resetForm.token.value,
            password: resetForm.password.value
          })
        }));
        location.href = "/login.html?reset=1";
      } catch (error) {
        setStatus(resetForm, error.message, "error");
      } finally {
        busy(button, false);
      }
    });
  }

  const account = document.querySelector("#accountPanel");
  if (account) {
    let csrf = "";

    const accountStatus = (message, type = "") => {
      const box = document.querySelector("#accountStatus");
      box.textContent = message || "";
      box.className = "form-status" + (type ? " " + type : "");
    };

    const loadAccount = async () => {
      try {
        const data = await parse(await api("me", { headers: {} }));
        csrf = data.csrf;
        document.querySelector("#accountName").textContent = data.user.name;
        document.querySelector("#accountEmail").textContent = data.user.email;
        document.querySelector("#accountCreated").textContent = data.user.createdAt || "-";
        document.querySelector("#notifyUpdates").checked = Boolean(data.user.notifyUpdates);
        const badge = document.querySelector("#verifyBadge");
        badge.textContent = data.user.verified ? "E-mail подтверждён" : "E-mail не подтверждён";
        badge.className = "auth-badge " + (data.user.verified ? "success" : "warning");
        document.querySelector("#resendVerify").hidden = data.user.verified;
        const adminLink = document.querySelector("#adminNotifyLink");
        if (adminLink) adminLink.hidden = !data.user.isAdmin;
        const adminStatsLink = document.querySelector("#adminStatsLink");
        if (adminStatsLink) adminStatsLink.hidden = !data.user.isAdmin;
        const adminUsersLink = document.querySelector("#adminUsersLink");
        if (adminUsersLink) adminUsersLink.hidden = !data.user.isAdmin;
        account.hidden = false;
        document.querySelector("#accountLoading").hidden = true;
      } catch (_) {
        location.href = "/login.html";
      }
    };

    document.querySelector("#savePreferences")?.addEventListener("click", async event => {
      const button = event.currentTarget;
      busy(button, true, "Сохранение…");
      try {
        await parse(await api("preferences", {
          method: "POST",
          headers: { "x-csrf-token": csrf },
          body: JSON.stringify({ notifyUpdates: document.querySelector("#notifyUpdates").checked })
        }));
        accountStatus("Настройки сохранены.", "success");
      } catch (error) {
        accountStatus(error.message, "error");
      } finally {
        busy(button, false);
      }
    });

    document.querySelector("#resendVerify")?.addEventListener("click", async event => {
      const button = event.currentTarget;
      busy(button, true, "Отправка…");
      try {
        const data = await parse(await api("resend-verification", {
          method: "POST",
          headers: { "x-csrf-token": csrf },
          body: "{}"
        }));
        accountStatus(data.message, "success");
      } catch (error) {
        accountStatus(error.message, "error");
      } finally {
        busy(button, false);
      }
    });

    document.querySelector("#logoutButton")?.addEventListener("click", async () => {
      try {
        await api("logout", { method: "POST", headers: { "x-csrf-token": csrf }, body: "{}" });
      } finally {
        location.href = "/login.html";
      }
    });

    loadAccount();
  }

  const adminForm = document.querySelector("#adminNotifyForm");
  if (adminForm) {
    let csrf = "";
    const result = document.querySelector("#adminNotifyResult");

    const show = (message, type = "") => {
      result.hidden = false;
      result.textContent = message;
      result.className = "notify-result" + (type ? " " + type : "");
    };

    const loadAdmin = async () => {
      try {
        const me = await parse(await api("me", { headers: {} }));
        if (!me.user.isAdmin) throw new Error("Нет прав администратора.");
        csrf = me.csrf;

        const data = await parse(await api("admin-providers", { headers: {} }));
        document.querySelector("#adminDbState").textContent = "Подключена";
        document.querySelector("#adminMailState").textContent = data.emailConfigured ? "Готов" : "Не настроен";
        document.querySelector("#adminSubscribers").textContent = data.subscribers;
      } catch (error) {
        show(error.message, "error");
        adminForm.querySelectorAll("button,input,textarea").forEach(el => el.disabled = true);
      }
    };

    const send = async dryRun => {
      const button = dryRun ? document.querySelector("#adminDryRun") : document.querySelector("#adminSend");
      busy(button, true, dryRun ? "Проверка…" : "Отправка…");
      try {
        const data = await parse(await api("admin-notify", {
          method: "POST",
          headers: { "x-csrf-token": csrf },
          body: JSON.stringify({
            version: adminForm.version.value.trim(),
            title: adminForm.title.value.trim(),
            summary: adminForm.summary.value.trim(),
            url: adminForm.url.value.trim(),
            dryRun
          })
        }));
        show(
          dryRun
            ? "Получателей: " + data.planned
            : "Отправлено: " + data.sent + ". Ошибок: " + data.failed + ". Уже отправлялось: " + data.skipped + ".",
          dryRun ? "info" : "success"
        );
      } catch (error) {
        show(error.message, "error");
      } finally {
        busy(button, false);
      }
    };

    document.querySelector("#adminDryRun")?.addEventListener("click", () => send(true));
    adminForm.addEventListener("submit", event => {
      event.preventDefault();
      if (confirm("Отправить уведомление зарегистрированным пользователям?")) send(false);
    });

    loadAdmin();
  }
})();


(() => {
  const statsRoot = document.querySelector("#adminStats");
  if (!statsRoot) return;

  const api = (action) => fetch("/api/index.php?action=" + action, {
    credentials: "same-origin",
    cache: "no-store"
  });

  const parse = async response => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.message || "Ошибка сервера.");
    return data;
  };

  const esc = value => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const num = value => new Intl.NumberFormat("ru-RU").format(Number(value) || 0);
  const setText = (selector, value) => {
    const el = document.querySelector(selector);
    if (el) el.textContent = value;
  };
  let statsCsrf = "";

  function renderRows(targetId, rows, nameKey) {
    const target = document.querySelector(targetId);
    if (!target) return;
    if (!rows.length) {
      target.innerHTML = '<tr><td colspan="2">Нет данных</td></tr>';
      return;
    }
    target.innerHTML = rows.map(row =>
      '<tr><td>' + esc(row[nameKey] || "Неизвестно") + '</td><td>' + num(row.cnt) + '</td></tr>'
    ).join("");
  }

  function renderStats(data) {
    setText("#statPageViews", num(data.totals.pageViews));
    setText("#statFlasherViews", num(data.totals.flasherViews));
    setText("#statUnique", num(data.totals.uniqueVisitors));
    setText("#statRegistrations", num(data.totals.registrations));
    setText("#statVerified", num(data.totals.verifiedUsers));
    setText("#statSubscribers", num(data.totals.subscribers));
    setText("#statFirmwareN16R8", num(data.totals.firmwareDownloadsN16R8));
    setText("#statWindows", num(data.totals.windowsDownloads));
    setText("#statIos", num(data.totals.iosDownloads));
    setText("#statAndroid", num(data.totals.androidClicks));

    setText("#periodVisits", num(data.period.visits));
    setText("#periodUnique", num(data.period.uniqueVisitors));
    setText("#periodRegistrations", num(data.period.registrations));

    renderRows("#countryRows", data.countries, "country_name");
    renderRows("#registrationCountryRows", data.registrationCountries, "country_name");
    renderRows("#pageRows", data.topPages, "path");

    const chart = document.querySelector("#statsChart");
    const max = Math.max(1, ...data.daily.map(row => Number(row.visits) || 0));
    if (chart) chart.innerHTML = data.daily.map(row => {
      const height = Math.max(2, Math.round(((Number(row.visits) || 0) / max) * 100));
      const label = String(row.date).slice(5).split("-").reverse().join(".");
      let markers = "";
      if (row.registrations) markers += '<i class="stats-marker registrations" title="Регистрации: ' + num(row.registrations) + '"></i>';
      if (row.firmwareN16R8) {
        const firmwareTitle = 'ESP32-S3 N16R8: ' + num(row.firmwareN16R8);
        markers += '<i class="stats-marker firmware" title="' + esc(firmwareTitle) + '"></i>';
      }
      if (row.apps) markers += '<i class="stats-marker apps" title="Приложения: ' + num(row.apps) + '"></i>';
      return '<div class="stats-day" title="' + esc(row.date) + ': ' + num(row.visits) + ' посещений">' +
        '<div class="stats-day-bars"><i class="stats-bar visits" style="height:' + height + '%"></i>' + markers + '</div>' +
        '<span>' + esc(label) + '</span></div>';
    }).join("");

    setText("#statsPrivacy", data.privacy || "");
    document.querySelector("#statsContent").hidden = false;
    document.querySelector("#statsLoading").hidden = true;
  }

  async function loadStats() {
    try {
      const me = await parse(await api("me"));
      statsCsrf = me.csrf || "";
      if (!me.user.isAdmin) {
        location.href = "/account.html";
        return;
      }
      const days = document.querySelector("#statsDays").value;
      const data = await parse(await api("admin-stats&days=" + encodeURIComponent(days)));
      renderStats(data);
    } catch (error) {
      setText("#statsLoading", error.message);
    }
  }

  document.querySelector("#statsDays")?.addEventListener("change", () => {
    document.querySelector("#statsContent").hidden = true;
    document.querySelector("#statsLoading").hidden = false;
    setText("#statsLoading", "Загрузка статистики…");
    loadStats();
  });

  document.querySelector("#statsRefresh")?.addEventListener("click", async event => {
    const button = event.currentTarget;
    const oldText = button.textContent;
    button.disabled = true;
    button.textContent = "Обновление…";
    const status = document.querySelector("#statsActionStatus");
    if (status) {
      status.hidden = true;
      status.textContent = "";
    }
    try {
      await loadStats();
    } finally {
      button.disabled = false;
      button.textContent = oldText;
    }
  });

  document.querySelector("#statsClear")?.addEventListener("click", async event => {
    const confirmed = confirm(
      "Очистить всю собранную статистику?\n\nБудут удалены посещения сайта и Web Flasher, страны, уникальные посетители и счётчики скачиваний.\n\nЗарегистрированные пользователи и аккаунты удалены НЕ будут.\n\nЭто действие нельзя отменить."
    );
    if (!confirmed) return;

    const button = event.currentTarget;
    const oldText = button.textContent;
    const status = document.querySelector("#statsActionStatus");
    button.disabled = true;
    button.textContent = "Очистка…";

    try {
      const response = await fetch("/api/index.php?action=admin-stats-clear", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "x-csrf-token": statsCsrf }
      });
      const data = await parse(response);
      if (status) {
        status.textContent = data.message || "Статистика очищена.";
        status.className = "stats-action-status success";
        status.hidden = false;
      }
      await loadStats();
    } catch (error) {
      if (status) {
        status.textContent = error.message;
        status.className = "stats-action-status error";
        status.hidden = false;
      }
    } finally {
      button.disabled = false;
      button.textContent = oldText;
    }
  });

  loadStats();
})();


(() => {
  const usersRoot = document.querySelector("#adminUsers");
  if (!usersRoot) return;

  const api = action => fetch("/api/index.php?action=" + action, {
    credentials: "same-origin",
    cache: "no-store"
  });

  const parse = async response => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.message || "Ошибка сервера.");
    return data;
  };

  const esc = value => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const formatDate = value => {
    if (!value) return "-";
    const parsed = new Date(String(value).replace(" ", "T"));
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleString("ru-RU", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit"
    });
  };

  const search = document.querySelector("#usersSearch");
  const filter = document.querySelector("#usersFilter");
  const sort = document.querySelector("#usersSort");
  const rows = document.querySelector("#usersRows");
  const loading = document.querySelector("#usersLoading");
  const content = document.querySelector("#usersContent");
  const resultCount = document.querySelector("#usersResultCount");
  let timer = 0;

  function badge(text, type) {
    return '<span class="user-badge ' + type + '">' + esc(text) + '</span>';
  }

  function render(data) {
    document.querySelector("#usersAllCount").textContent = data.counts.all;
    document.querySelector("#usersVerifiedCount").textContent = data.counts.verified;
    document.querySelector("#usersUnverifiedCount").textContent = data.counts.unverified;
    document.querySelector("#usersSubscribedCount").textContent = data.counts.subscribed;
    document.querySelector("#usersAdminsCount").textContent = data.counts.admins;
    resultCount.textContent = "Найдено: " + data.count;

    rows.innerHTML = data.users.length ? data.users.map(user => {
      const status = user.verified
        ? badge("Подтверждён", "success")
        : badge("Не подтверждён", "warning");
      const subscription = user.notifyUpdates
        ? badge("Подписан", "accent")
        : badge("Нет", "muted");
      const admin = user.isAdmin ? badge("Админ", "admin") : "";

      return '<tr>' +
        '<td><div class="user-name">' + esc(user.name) + admin + '</div><small>ID ' + user.id + '</small></td>' +
        '<td><a class="user-email" href="mailto:' + encodeURIComponent(user.email) + '">' + esc(user.email) + '</a></td>' +
        '<td>' + status + '</td>' +
        '<td>' + subscription + '</td>' +
        '<td><time>' + esc(formatDate(user.createdAt)) + '</time></td>' +
        '</tr>';
    }).join("") : '<tr><td colspan="5" class="users-empty">Пользователи не найдены.</td></tr>';

    loading.hidden = true;
    content.hidden = false;
  }

  async function loadUsers() {
    loading.hidden = false;
    loading.textContent = "Загрузка пользователей…";
    content.hidden = true;

    try {
      const me = await parse(await api("me"));
      if (!me.user.isAdmin) {
        location.href = "/account.html";
        return;
      }

      const params = new URLSearchParams({
        q: search?.value.trim() || "",
        filter: filter?.value || "all",
        sort: sort?.value || "newest"
      });
      const data = await parse(await api("admin-users&" + params.toString()));
      render(data);
    } catch (error) {
      loading.hidden = false;
      loading.textContent = error.message;
    }
  }

  search?.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(loadUsers, 250);
  });
  filter?.addEventListener("change", loadUsers);
  sort?.addEventListener("change", loadUsers);
  document.querySelector("#usersRefresh")?.addEventListener("click", loadUsers);

  loadUsers();
})();


(() => {
  const passwordInputs = [...document.querySelectorAll('input[type="password"]')];

  passwordInputs.forEach(input => {
    if (input.closest(".password-field")) return;

    const wrapper = document.createElement("div");
    wrapper.className = "password-field";
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "password-visibility-toggle";
    button.setAttribute("aria-label", "Показать пароль");
    button.setAttribute("title", "Показать пароль");
    button.innerHTML = '<span class="password-eye" aria-hidden="true"></span>';
    wrapper.appendChild(button);

    button.addEventListener("click", () => {
      const hidden = input.type === "password";
      input.type = hidden ? "text" : "password";
      button.classList.toggle("visible", hidden);
      button.setAttribute("aria-label", hidden ? "Скрыть пароль" : "Показать пароль");
      button.setAttribute("title", hidden ? "Скрыть пароль" : "Показать пароль");
    });
  });
})();


(() => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "scroll-to-top-button";
  button.setAttribute("aria-label", "Наверх");
  button.setAttribute("title", "Наверх");
  button.innerHTML = '<span aria-hidden="true">↑</span>';
  document.body.appendChild(button);

  const updateVisibility = () => {
    button.classList.toggle("visible", window.scrollY > 420);
  };

  button.addEventListener("click", () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  });

  window.addEventListener("scroll", updateVisibility, { passive: true });
  updateVisibility();
})();

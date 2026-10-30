(() => {
  const statsRoot = document.querySelector("#adminStats");
  if (!statsRoot) return;

  const api = (action) => action === "me" && window.FierySession ? window.FierySession.get() : fetch("/api/index.php?action=" + action, {
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

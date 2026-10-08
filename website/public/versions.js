(() => {
  const SOURCE = "https://raw.githubusercontent.com/MishanyaTS/FieryLedLamp/main/FieryLedLamp/Version.txt";
  const historyEl = document.querySelector("#versionHistory");
  const currentEl = document.querySelector("#currentVersion");
  const countEl = document.querySelector("#versionCount");
  const searchEl = document.querySelector("#versionSearch");
  const noResultsEl = document.querySelector("#versionNoResults");
  if (!historyEl) return;

  const escapeHtml = (value) => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function isVersionHeading(line) {
    const value = line.trim();
    return /^(?:Версия\s+)?(?:FieryLedLamp\s+)?v?\d+(?:\.\d+)+(?:\s+.*)?$/i.test(value)
      || /^FieryLedLamp\s+v?\d+(?:\.\d+)+(?:\s+.*)?$/i.test(value);
  }

  function parseHistory(text) {
    const lines = text.replace(/\r/g, "").split("\n");
    const currentLine = lines.find(line => /^Текущая версия\s*:/i.test(line.trim())) || "";
    const current = currentLine.replace(/^Текущая версия\s*:\s*/i, "").trim();

    const markerIndex = lines.findIndex(line => /ИСТОРИЯ ВЕРСИЙ/i.test(line));
    const body = markerIndex >= 0 ? lines.slice(markerIndex + 1) : lines;
    const versions = [];
    let currentVersion = null;

    for (const raw of body) {
      const line = raw.trimEnd();
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (isVersionHeading(trimmed)) {
        currentVersion = { title: trimmed, lines: [] };
        versions.push(currentVersion);
        continue;
      }

      if (!currentVersion) continue;
      currentVersion.lines.push(trimmed);
    }

    return { current, versions };
  }

  function render(data) {
    currentEl.textContent = data.current || (data.versions[0]?.title ?? "не определена");
    countEl.textContent = String(data.versions.length);

    historyEl.innerHTML = data.versions.map((version, index) => {
      const currentBadge = index === 0 ? '<span class="version-current-badge">Текущая</span>' : "";
      const body = version.lines.map(line => {
        const bullet = /^[-–—]\s*/.test(line);
        const clean = bullet ? line.replace(/^[-–—]\s*/, "") : line;
        const className = bullet ? "version-change bullet" : "version-change note";
        return `<div class="${className}">${escapeHtml(clean)}</div>`;
      }).join("");

      return `<details class="version-card" data-search="${escapeHtml((version.title + " " + version.lines.join(" ")).toLowerCase())}" ${index < 2 ? "open" : ""}>
        <summary><div class="version-title"><h2>${escapeHtml(version.title)}</h2>${currentBadge}</div></summary>
        <div class="version-body">${body || '<div class="version-change note">Описание изменений отсутствует.</div>'}</div>
      </details>`;
    }).join("");

    applyFilter();
  }

  function applyFilter() {
    if (!searchEl) return;
    const q = searchEl.value.trim().toLowerCase();
    const cards = [...historyEl.querySelectorAll(".version-card")];
    let visible = 0;
    for (const card of cards) {
      const match = !q || card.dataset.search.includes(q);
      card.hidden = !match;
      if (match) {
        visible++;
        if (q) card.open = true;
      }
    }
    if (noResultsEl) noResultsEl.hidden = visible !== 0;
  }

  if (searchEl) searchEl.addEventListener("input", applyFilter);

  fetch(SOURCE + "?t=" + Date.now(), { cache: "no-store" })
    .then(response => {
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.text();
    })
    .then(text => {
      const data = parseHistory(text);
      if (!data.versions.length) throw new Error("История версий не найдена в Version.txt");
      render(data);
    })
    .catch(error => {
      historyEl.innerHTML = `<div class="version-state error">Не удалось загрузить историю версий с GitHub: ${escapeHtml(error.message)}. Попробуйте обновить страницу позже.</div>`;
      currentEl.textContent = "недоступна";
      countEl.textContent = "—";
    });
})();
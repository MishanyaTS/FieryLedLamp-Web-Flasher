(() => {
  // Источник истории находится в папке firmware этого репозитория.
  const SOURCE = "https://raw.githubusercontent.com/MishanyaTS/FieryLedLamp-Web-Flasher/main/firmware/Version.txt";

  const historyEl = document.querySelector("#versionHistory");
  const currentEl = document.querySelector("#currentVersion");
  const countEl = document.querySelector("#versionCount");
  const visibleCountEl = document.querySelector("#versionVisibleCount");
  const latestNotesEl = document.querySelector("#versionLatestNotes");
  const searchEl = document.querySelector("#versionSearch");
  const noResultsEl = document.querySelector("#versionNoResults");
  const filterButtons = [...document.querySelectorAll(".version-filter")];
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
      const trimmed = raw.trim();
      if (!trimmed) continue;

      if (isVersionHeading(trimmed)) {
        currentVersion = { title: trimmed, lines: [] };
        versions.push(currentVersion);
        continue;
      }

      if (currentVersion) currentVersion.lines.push(trimmed);
    }

    return { current, versions };
  }

  function versionNumber(title) {
    const match = title.match(/v?(\d+(?:\.\d+)+)/i);
    return match ? "v" + match[1] : title;
  }

  function renderLatest(data) {
    const latest = data.versions[0];
    currentEl.textContent = data.current || latest?.title || "не определена";
    countEl.textContent = String(data.versions.length);

    if (!latestNotesEl || !latest) return;
    const lines = latest.lines.filter(line => /^[-–—]\s*/.test(line)).slice(0, 3);
    latestNotesEl.innerHTML = lines.length
      ? lines.map(line => `<div><span>✓</span><p>${escapeHtml(line.replace(/^[-–—]\s*/, ""))}</p></div>`).join("")
      : '<div><span>✓</span><p>Актуальная версия прошивки FieryLedLamp.</p></div>';
  }

  function render(data) {
    renderLatest(data);

    historyEl.innerHTML = data.versions.map((version, index) => {
      const cleanTitle = versionNumber(version.title);
      const subtitle = version.title.replace(cleanTitle, "").replace(/^\s*FieryLedLamp\s*/i, "").trim();
      const body = version.lines.map(line => {
        const bullet = /^[-–—]\s*/.test(line);
        const clean = bullet ? line.replace(/^[-–—]\s*/, "") : line;
        return bullet
          ? `<li>${escapeHtml(clean)}</li>`
          : `<div class="version-note">${escapeHtml(clean)}</div>`;
      }).join("");

      return `<article class="version-entry" data-search="${escapeHtml((version.title + " " + version.lines.join(" ")).toLowerCase())}">
        <div class="version-rail">
          <span class="version-dot ${index === 0 ? "current" : ""}"></span>
          <span class="version-line"></span>
        </div>
        <details class="version-release" ${index < 2 ? "open" : ""}>
          <summary>
            <div class="version-release-main">
              <div class="version-number">${escapeHtml(cleanTitle)}</div>
              <div class="version-release-title">
                <h3>${index === 0 ? "Текущая версия" : "FieryLedLamp"}</h3>
                ${subtitle ? `<span>${escapeHtml(subtitle)}</span>` : ""}
              </div>
            </div>
            <div class="version-release-side">
              ${index === 0 ? '<span class="version-current-badge">Текущая</span>' : ""}
              <span class="version-toggle"></span>
            </div>
          </summary>
          <div class="version-release-body">
            <ul>${body}</ul>
          </div>
        </details>
      </article>`;
    }).join("");

    applyFilter();
  }

  function applyFilter() {
    const q = (searchEl?.value || "").trim().toLowerCase();
    const entries = [...historyEl.querySelectorAll(".version-entry")];
    let visible = 0;

    for (const entry of entries) {
      const match = !q || entry.dataset.search.includes(q);
      entry.hidden = !match;
      if (match) {
        visible++;
        if (q) entry.querySelector("details").open = true;
      }
    }

    if (visibleCountEl) visibleCountEl.textContent = `Показано: ${visible}`;
    if (noResultsEl) noResultsEl.hidden = visible !== 0;
  }

  if (searchEl) {
    searchEl.addEventListener("input", () => {
      filterButtons.forEach(btn => btn.classList.toggle("active", btn.dataset.query === ""));
      applyFilter();
    });
  }

  filterButtons.forEach(button => {
    button.addEventListener("click", () => {
      filterButtons.forEach(btn => btn.classList.remove("active"));
      button.classList.add("active");
      if (searchEl) searchEl.value = button.dataset.query || "";
      applyFilter();
    });
  });

  fetch(SOURCE + "?t=" + Date.now(), { cache: "no-store" })
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
      historyEl.innerHTML = `<div class="version-state error"><b>Не удалось загрузить историю версий</b><span>${escapeHtml(error.message)}</span></div>`;
      currentEl.textContent = "недоступна";
      countEl.textContent = "—";
      if (visibleCountEl) visibleCountEl.textContent = "—";
      if (latestNotesEl) latestNotesEl.innerHTML = '<div><span>!</span><p>Источник временно недоступен.</p></div>';
    });
})();
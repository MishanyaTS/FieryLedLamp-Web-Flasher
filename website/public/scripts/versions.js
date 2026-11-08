(() => {
  const SOURCE = "/Version.txt";

  const history = document.querySelector("#versionHistory");
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

    return { versions };
  }

  function getVersionNumber(title) {
    const match = title.match(/v?(\d+(?:\.\d+)+)/i);
    return match ? "v" + match[1] : title;
  }

  function render(data) {
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

      return `<article class="version-entry${index === 0 ? " is-current" : ""}" data-search="${escapeHtml(searchText)}">
        <div class="version-rail">
          <span class="version-dot ${index === 0 ? "current" : ""}"></span>
          <span class="version-line"></span>
        </div>
        <details class="version-release" ${index === 0 ? "open" : ""}>
          <summary>
            <div class="version-release-main">
              <div class="version-number">${escapeHtml(number)}</div>
              <div class="version-release-title">
                <h3>${index === 0 ? "Актуальная версия" : "Fiery Led Lamp"}</h3>
                ${subtitle ? `<span>${escapeHtml(subtitle)}</span>` : ""}
              </div>
            </div>
            <div class="version-release-side">
              ${index === 0 ? '<span class="version-current-badge">Актуальная</span>' : ""}
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

  fetch(SOURCE, { cache: "no-cache" })
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
      if (visibleCount) visibleCount.textContent = "-";
      if (noResults) noResults.hidden = true;
    });
})();

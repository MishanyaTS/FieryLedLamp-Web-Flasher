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
      currentVersion.textContent = data.current || latest?.title || "не определена";
    }
    if (!latestNotes || !latest) return;

    const items = latest.changes
      .filter(line => /^[-–—]\s*/.test(line))
      .slice(0, 3)
      .map(line => line.replace(/^[-–—]\s*/, ""));

    latestNotes.innerHTML = (items.length ? items : ["Актуальная версия прошивки FieryLedLamp."])
      .map(item => `<div><span>✓</span><p>${escapeHtml(item)}</p></div>`)
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
          ? `<li>${escapeHtml(text)}</li>`
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
                <h3>${index === 0 ? "Текущая версия" : "FieryLedLamp"}</h3>
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
      if (visibleCount) visibleCount.textContent = "—";
      if (latestNotes) latestNotes.innerHTML = '<div><span>!</span><p>Источник временно недоступен.</p></div>';
      if (noResults) noResults.hidden = true;
    });
})();
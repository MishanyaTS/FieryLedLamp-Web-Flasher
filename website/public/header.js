(() => {
  "use strict";
  const header = document.querySelector(".fl-header");
  if (!header) return;
  const menu = header.querySelector(".fl-menu-toggle");
  const nav = header.querySelector(".fl-main-nav");
  const dropdowns = [...header.querySelectorAll(".fl-subnav-toggle")];
  const search = header.querySelector(".fl-search");
  const input = search?.querySelector("input");
  const results = search?.querySelector(".fl-search-results");
  const mainBase = new URL(header.dataset.mainBase || "/", location.href);
  let indexPromise;
  let matches = [];
  let selected = -1;
  let searchRevision = 0;

  const closeDropdowns = except => dropdowns.forEach(button => {
    if (button === except) return;
    button.setAttribute("aria-expanded", "false");
    document.getElementById(button.getAttribute("aria-controls")).hidden = true;
  });
  const closeSearch = () => {
    if (!results || !input) return;
    searchRevision++;
    results.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  };
  const closeMenu = () => {
    header.classList.remove("fl-menu-open");
    menu?.setAttribute("aria-expanded", "false");
    menu?.setAttribute("aria-label", "Открыть главное меню");
    closeDropdowns();
  };
  menu?.addEventListener("click", () => {
    const open = header.classList.toggle("fl-menu-open");
    menu.setAttribute("aria-expanded", String(open));
    menu.setAttribute("aria-label", open ? "Закрыть главное меню" : "Открыть главное меню");
    closeSearch();
    if (!open) closeDropdowns();
  });
  dropdowns.forEach(button => button.addEventListener("click", () => {
    const open = button.getAttribute("aria-expanded") !== "true";
    closeDropdowns(button);
    button.setAttribute("aria-expanded", String(open));
    document.getElementById(button.getAttribute("aria-controls")).hidden = !open;
    closeSearch();
  }));
  const desktop = matchMedia("(min-width: 1101px)");
  desktop.addEventListener("change", closeMenu);
  nav?.addEventListener("click", event => {
    if (event.target.closest("a") && !desktop.matches) closeMenu();
  });
  document.addEventListener("pointerdown", event => {
    if (!header.contains(event.target)) { closeDropdowns(); closeSearch(); }
    else if (search && !search.contains(event.target)) closeSearch();
  });
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    const openDropdown = dropdowns.find(button => button.getAttribute("aria-expanded") === "true");
    if (openDropdown) { closeDropdowns(); openDropdown.focus(); }
    else if (results && !results.hidden) closeSearch();
    else if (header.classList.contains("fl-menu-open")) { closeMenu(); menu?.focus(); }
  });

  const normalize = value => String(value || "").toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/\s+/g, " ").trim();
  const loadIndex = () => {
    if (!indexPromise) indexPromise = fetch(header.dataset.searchIndex, { credentials: "same-origin" })
      .then(response => { if (!response.ok) throw new Error("search"); return response.json(); })
      .then(data => {
        if (!Array.isArray(data.pages)) throw new Error("search");
        return data.pages.filter(page => typeof page.title === "string" && /^\/(?:[a-z0-9-]+\.html)?$/.test(page.href)).map(page => ({
          ...page, normalizedTitle: normalize(page.title), normalizedText: normalize(page.text), normalizedHeadings: normalize(page.headings)
        }));
      }).catch(error => { indexPromise = undefined; throw error; });
    return indexPromise;
  };
  const showResults = () => {
    results.hidden = false;
    input.setAttribute("aria-expanded", "true");
  };
  const showMessage = text => {
    results.replaceChildren();
    const message = document.createElement("p");
    message.className = "fl-search-message";
    message.textContent = text;
    results.append(message);
    showResults();
  };
  const snippet = (page, query) => {
    const body = String(page.text || "");
    const position = normalize(body).indexOf(query);
    const start = position > 65 ? position - 45 : 0;
    return (start ? "…" : "") + body.slice(start, start + 140) + (body.length > start + 140 ? "…" : "");
  };
  const select = position => {
    const options = [...results.querySelectorAll("a")];
    if (!options.length) return;
    selected = (position + options.length) % options.length;
    options.forEach((option, index) => {
      option.classList.toggle("is-selected", index === selected);
      option.setAttribute("aria-selected", String(index === selected));
    });
    input.setAttribute("aria-activedescendant", options[selected].id);
    options[selected].scrollIntoView({ block: "nearest" });
  };
  const runSearch = async () => {
    const revision = ++searchRevision;
    const query = normalize(input.value);
    matches = [];
    selected = -1;
    input.removeAttribute("aria-activedescendant");
    if (query.length < 2) { showMessage("Введите не менее двух символов для поиска по сайту."); return []; }
    try {
      const pages = await loadIndex();
      if (revision !== searchRevision || normalize(input.value) !== query) return [];
      const words = query.split(" ").filter(Boolean);
      matches = pages.map(page => {
        const titleMatch = page.normalizedTitle.includes(query);
        const text = page.normalizedTitle + " " + page.normalizedText;
        if (!words.every(word => text.includes(word))) return null;
        const score = (titleMatch ? 100 : 0) + (page.normalizedHeadings.includes(query) ? 40 : 0) + words.reduce((n, word) => n + (page.normalizedTitle.includes(word) ? 20 : page.normalizedHeadings.includes(word) ? 7 : 1), 0) - (page.href === "/" ? 3 : 0);
        return { page, score };
      }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 6).map(item => item.page);
      results.replaceChildren();
      if (!matches.length) { showMessage("Ничего не найдено. Попробуйте другое слово."); return []; }
      matches.forEach((page, index) => {
        const link = document.createElement("a");
        link.id = "fl-search-option-" + index;
        link.href = new URL(page.href.slice(1), mainBase).href;
        link.setAttribute("role", "option");
        link.setAttribute("aria-selected", "false");
        link.tabIndex = -1;
        const title = document.createElement("b");
        title.textContent = page.title;
        const description = document.createElement("small");
        description.textContent = snippet(page, query);
        link.append(title, description);
        results.append(link);
      });
      showResults();
      return matches;
    } catch (_) {
      if (revision === searchRevision) showMessage("Поиск временно недоступен. Попробуйте позже.");
      return [];
    }
  };
  if (search && input && results) {
    let debounce;
    input.addEventListener("input", () => {
      clearTimeout(debounce);
      matches = [];
      selected = -1;
      closeSearch();
      debounce = setTimeout(runSearch, 140);
    });
    input.addEventListener("focus", () => {
      closeDropdowns();
      if (!desktop.matches) closeMenu();
      if (input.value.trim()) runSearch();
      else loadIndex().catch(() => {});
    });
    input.addEventListener("keydown", event => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (!results.hidden && matches.length) select(selected < 0 ? (event.key === "ArrowDown" ? 0 : matches.length - 1) : selected + (event.key === "ArrowDown" ? 1 : -1));
        else runSearch().then(() => { if (matches.length) select(0); });
      }
    });
    search.addEventListener("submit", async event => {
      event.preventDefault();
      clearTimeout(debounce);
      const choice = selected;
      const current = await runSearch();
      if (current.length) {
        const option = results.querySelectorAll("a")[Math.max(0, Math.min(choice, current.length - 1))];
        if (option) location.assign(option.href);
      }
    });
    search.addEventListener("focusout", event => { if (!search.contains(event.relatedTarget)) closeSearch(); });
  }

  if (header.dataset.auth === "local") {
    fetch("/api/index.php?action=me", { credentials: "same-origin", cache: "no-store" })
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (!data?.ok || !data.user) return;
        const login = header.querySelector("[data-fl-login]");
        const register = header.querySelector("[data-fl-register]");
        if (!login) return;
        login.href = new URL("account.html", mainBase).href;
        login.querySelector("span").textContent = data.user.name || "Мой аккаунт";
        login.querySelector("span").classList.add("fl-profile-label");
        login.setAttribute("aria-label", "Мой аккаунт: " + (data.user.name || ""));
        if (register) register.hidden = true;
      }).catch(() => {});
  }
})();

(() => {
  "use strict";
  const header = document.querySelector(".fl-header");
  if (!header) return;
  if (header.dataset.auth === "local" && !window.FierySession) {
    let pending;
    window.FierySession = {
      get() {
        if (!pending) pending = fetch("/api/index.php?action=me", { credentials: "same-origin", cache: "no-store" })
          .catch(error => { pending = undefined; throw error; });
        return pending.then(response => response.clone());
      },
      invalidate() { pending = undefined; }
    };
  }
  const menu = header.querySelector(".fl-menu-toggle");
  const nav = header.querySelector(".fl-main-nav");
  const dropdowns = [...header.querySelectorAll(".fl-subnav-toggle")];
  const search = header.querySelector(".fl-search");
  const input = search?.querySelector("input");
  const results = header.querySelector(".fl-search-results");
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
    else if (search && !search.contains(event.target) && !results?.contains(event.target)) closeSearch();
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
    const option = options[selected];
    const top = option.offsetTop;
    const bottom = top + option.offsetHeight;
    if (top < results.scrollTop) results.scrollTop = top;
    else if (bottom > results.scrollTop + results.clientHeight) results.scrollTop = bottom - results.clientHeight;
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
      results.scrollTop = 0;
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
    const closeOnFocusOut = event => {
      if (!search.contains(event.relatedTarget) && !results.contains(event.relatedTarget)) closeSearch();
    };
    search.addEventListener("focusout", closeOnFocusOut);
    results.addEventListener("focusout", closeOnFocusOut);
  }

  if (header.dataset.auth === "local" || header.dataset.auth === "remote") {
    const login = header.querySelector("[data-fl-login]");
    const register = header.querySelector("[data-fl-register]");
    const cacheKey = "fiery_header_user_name";

    // Only the public display name is cached for this tab; session validation
    // still happens on every page. No passwords or session tokens are stored.
    const readCachedName = () => {
      try { return sessionStorage.getItem(cacheKey) || ""; }
      catch (_) { return ""; }
    };
    const rememberName = name => {
      try {
        if (name) sessionStorage.setItem(cacheKey, name);
        else sessionStorage.removeItem(cacheKey);
      } catch (_) {}
    };
    const displayUser = name => {
      if (!login) return;
      const label = login.querySelector("span");
      if (name) {
        const accountUrl = new URL("account.html", mainBase).href;
        const title = "Мой аккаунт: " + name;
        if (login.href !== accountUrl) login.href = accountUrl;
        if (label) {
          if (label.textContent !== name) label.textContent = name;
          label.classList.add("fl-profile-label");
        }
        if (login.getAttribute("aria-label") !== title) login.setAttribute("aria-label", title);
        if (login.title !== title) login.title = title;
        if (register && !register.hidden) register.hidden = true;
      } else {
        const loginUrl = new URL("login.html", mainBase).href;
        if (login.href !== loginUrl) login.href = loginUrl;
        if (label) {
          if (label.textContent !== "Вход") label.textContent = "Вход";
          label.classList.remove("fl-profile-label");
        }
        if (login.getAttribute("aria-label") !== "Вход") login.setAttribute("aria-label", "Вход");
        if (login.title !== "Вход") login.title = "Вход";
        if (register && register.hidden) register.hidden = false;
      }
      header.dataset.authReady = "true";
    };
    window.FieryHeader = {
      setName(value) {
        const name = String(value || "").trim();
        rememberName(name);
        displayUser(name);
      },
      clear() {
        rememberName("");
        displayUser("");
      }
    };

    const cachedName = readCachedName();
    if (cachedName) displayUser(cachedName);

    // The main site uses its existing session request; Web Flasher asks
    // only the minimal name endpoint on fieryledlamp.ru.
    const sessionRequest = header.dataset.auth === "local"
      ? window.FierySession.get()
      : fetch(new URL("api/index.php?action=header-user", mainBase), {
          method: "GET", credentials: "include", cache: "no-store"
        });
    sessionRequest
      .then(response => {
        if (response.status === 401) {
          window.FieryHeader.clear();
          return null;
        }
        if (!response.ok) {
          // A temporary server error should not flash "Вход" over a known name.
          if (!cachedName) displayUser("");
          return null;
        }
        return response.json();
      })
      .then(data => {
        if (!data) return;
        if (data.ok && data.user) {
          window.FieryHeader.setName(data.user.name || "Мой аккаунт");
        } else {
          window.FieryHeader.clear();
        }
      })
      .catch(() => {
        if (!header.dataset.authReady) displayUser("");
      });
  }
  // Preserve the actual header DOM when navigating between static guide pages.
  // Dynamic pages (forum/account/history) retain normal navigation so their
  // own scripts and form handlers are initialized on a fresh document.
  if (header.dataset.auth === "local") {
    const staticPages = new Set([
      "/", "/index.html", "/setup.html", "/hardware.html",
      "/mqtt-broker.html", "/mqtt-commands.html", "/mqtt-wqtt.html",
      "/mqtt-smart-home.html", "/fiery-lamp-control.html"
    ]);
    let displayedPath = location.pathname;
    let request = null;
    let navigationIndex = 0;

    const stylesOf = doc => [...doc.querySelectorAll('link[rel="stylesheet"][href]')]
      .map(link => new URL(link.getAttribute("href"), doc.baseURI).pathname)
      .sort().join("|");

    const supportsSoftNavigation = doc => {
      if (!doc.querySelector("main") || !doc.querySelector("footer")) return false;
      if (stylesOf(doc) !== stylesOf(document)) return false;
      return [...doc.querySelectorAll("script")].every(script => {
        if (script.closest(".fl-header")) return true;
        if (!script.src && !script.getAttribute("src")) return false;
        const scriptUrl = new URL(script.getAttribute("src"), doc.baseURI);
        return scriptUrl.origin === location.origin
          && (scriptUrl.pathname === "/site.js" || scriptUrl.pathname === "/header.js");
      });
    };

    const updateActiveNavigation = doc => {
      const live = [...header.querySelectorAll(".fl-main-nav a")];
      const incoming = [...doc.querySelectorAll(".fl-header .fl-main-nav a")];
      if (incoming.length !== live.length) return;
      live.forEach((link, index) => {
        link.classList.toggle("is-active", incoming[index].classList.contains("is-active"));
        const current = incoming[index].getAttribute("aria-current");
        if (current) link.setAttribute("aria-current", current);
        else link.removeAttribute("aria-current");
      });
    };

    const loadStaticPage = async (target, push) => {
      request?.abort();
      const controller = new AbortController();
      request = controller;
      const id = ++navigationIndex;

      try {
        const response = await fetch(target.href, {
          credentials: "same-origin",
          signal: controller.signal,
          cache: "default",
          headers: { "Accept": "text/html" }
        });
        if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) {
          throw new Error("Page not available");
        }
        const finalUrl = new URL(response.url);
        if (finalUrl.origin !== location.origin || finalUrl.pathname !== target.pathname) {
          throw new Error("Unexpected redirect");
        }
        const source = new DOMParser().parseFromString(await response.text(), "text/html");
        if (!supportsSoftNavigation(source)) throw new Error("Page requires full navigation");
        if (controller.signal.aborted || id !== navigationIndex) return;

        const nextMain = document.importNode(source.querySelector("main"), true);
        const nextFooter = document.importNode(source.querySelector("footer"), true);
        document.querySelector("main").replaceWith(nextMain);
        document.querySelector("footer").replaceWith(nextFooter);
        document.title = source.title;
        const description = source.querySelector('meta[name="description"]');
        const currentDescription = document.querySelector('meta[name="description"]');
        if (description && currentDescription) {
          currentDescription.content = description.content;
        }
        updateActiveNavigation(source);

        if (push) history.pushState({ fieryPage: true }, "", target.href);
        displayedPath = target.pathname;
        closeMenu();
        closeSearch();
        if (target.hash) {
          const anchor = document.getElementById(decodeURIComponent(target.hash.slice(1)));
          if (anchor) anchor.scrollIntoView();
          else scrollTo(0, 0);
        } else {
          scrollTo(0, 0);
        }
        window.FieryAnalytics?.track?.("page_view", "", target.pathname);
      } catch (error) {
        if (controller.signal.aborted || id !== navigationIndex) return;
        // If a page gets its own script or stylesheet later, use the browser's
        // normal navigation instead of leaving the new page half-initialized.
        if (push) location.assign(target.href);
        else location.reload();
      } finally {
        if (request === controller) request = null;
      }
    };

    document.addEventListener("click", event => {
      if (event.defaultPrevented || event.button !== 0 ||
          event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ||
          !staticPages.has(displayedPath)) return;
      const link = event.target.closest("a[href]");
      if (!link || link.hasAttribute("download") ||
          (link.target && link.target !== "_self")) return;
      const target = new URL(link.href, location.href);
      if (target.origin !== location.origin || !staticPages.has(target.pathname) ||
          target.search || (target.pathname === displayedPath && target.hash)) return;
      if (target.href === location.href) return;
      event.preventDefault();
      loadStaticPage(target, true);
    });

    window.addEventListener("popstate", () => {
      if (!staticPages.has(displayedPath) || !staticPages.has(location.pathname)) {
        location.reload();
        return;
      }
      if (displayedPath !== location.pathname) {
        loadStaticPage(new URL(location.href), false);
      }
    });
  }

})();

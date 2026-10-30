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
      if (navigator.sendBeacon?.(TRACK_URL, new Blob([payload], { type: "text/plain;charset=UTF-8" }))) {
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
  if (!excluded.includes(location.pathname)) {
    let sent = false;
    const send = () => { if (!sent) { sent = true; track("page_view"); } };
    const schedule = () => {
      if ("requestIdleCallback" in window) requestIdleCallback(send, { timeout: 1500 });
      else setTimeout(send, 300);
    };
    addEventListener("pagehide", send, { once: true });
    if (document.readyState === "complete") schedule();
    else addEventListener("load", schedule, { once: true });
  }
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

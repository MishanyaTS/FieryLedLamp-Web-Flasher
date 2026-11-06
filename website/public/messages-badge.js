(() => {
  "use strict";
  const badge = document.getElementById("pmUnreadBadge");
  if (!badge) return;
  (async () => {
    try {
      const session = await (window.FierySession
        ? window.FierySession.get()
        : fetch("/api/index.php?action=me", { credentials: "same-origin", cache: "no-store" }));
      if (!session.ok) return;
      const response = await fetch("/api/index.php?action=pm-unread", {
        credentials: "same-origin", cache: "no-store",
      });
      const data = await response.json();
      const unread = Number(data.count || 0);
      if (!response.ok || !data.ok || unread <= 0) return;
      badge.textContent = "(" + unread + " новых)";
      badge.hidden = false;
    } catch (_) { /* Личные сообщения доступны и без счётчика. */ }
  })();
})();

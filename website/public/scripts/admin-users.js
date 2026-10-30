(() => {
  const usersRoot = document.querySelector("#adminUsers");
  if (!usersRoot) return;

  const api = action => action === "me" && window.FierySession ? window.FierySession.get() : fetch("/api/index.php?action=" + action, {
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

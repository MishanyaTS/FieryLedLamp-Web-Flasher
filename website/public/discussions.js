(() => {
  const meUrl = "/api/index.php?action=me";
  const listUrl = "/api/index.php?action=discussion-list";
  const postUrl = "/api/index.php?action=discussion-post";

  const guest = document.querySelector("#discussionGuest");
  const form = document.querySelector("#discussionForm");
  const text = document.querySelector("#discussionText");
  const counter = document.querySelector("#discussionCounter");
  const status = document.querySelector("#discussionStatus");
  const submit = document.querySelector("#discussionSubmit");
  const list = document.querySelector("#discussionList");
  const refresh = document.querySelector("#discussionRefresh");
  const userLabel = document.querySelector("#discussionUser");

  if (!list) return;

  let csrf = "";

  function setStatus(message = "", type = "") {
    if (!status) return;
    status.textContent = message;
    status.className = "discussion-status" + (type ? " " + type : "");
  }

  function initials(name) {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    return (parts[0]?.[0] || "?").toUpperCase() + (parts[1]?.[0] || "").toUpperCase();
  }

  function renderMessages(messages) {
    list.replaceChildren();

    if (!Array.isArray(messages) || messages.length === 0) {
      const empty = document.createElement("div");
      empty.className = "discussion-empty";
      empty.textContent = "Сообщений пока нет. Начните обсуждение первым.";
      list.appendChild(empty);
      return;
    }

    for (const item of messages) {
      const article = document.createElement("article");
      article.className = "discussion-message";

      const head = document.createElement("div");
      head.className = "discussion-message-head";

      const avatar = document.createElement("div");
      avatar.className = "discussion-avatar";
      avatar.textContent = initials(item.author);

      const meta = document.createElement("div");
      const author = document.createElement("div");
      author.className = "discussion-author";
      author.append(document.createTextNode(String(item.author || "Пользователь")));

      if (item.isAdmin) {
        const badge = document.createElement("span");
        badge.className = "discussion-admin";
        badge.textContent = "Администратор";
        author.appendChild(badge);
      }

      const date = document.createElement("span");
      date.className = "discussion-date";
      date.textContent = String(item.createdAt || "");

      meta.append(author, date);
      head.append(avatar, meta);

      const body = document.createElement("p");
      body.className = "discussion-body";
      body.textContent = String(item.body || "");

      article.append(head, body);
      list.appendChild(article);
    }
  }

  async function loadMessages() {
    if (refresh) refresh.disabled = true;
    try {
      const response = await fetch(listUrl, { credentials: "same-origin", cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || "Не удалось загрузить сообщения.");
      renderMessages(data.messages);
    } catch (error) {
      list.replaceChildren();
      const state = document.createElement("div");
      state.className = "discussion-empty";
      state.textContent = error.message || "Не удалось загрузить сообщения.";
      list.appendChild(state);
    } finally {
      if (refresh) refresh.disabled = false;
    }
  }

  async function loadUser() {
    try {
      const response = await fetch(meUrl, { credentials: "same-origin", cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error("guest");

      csrf = String(data.csrf || "");
      if (userLabel) userLabel.textContent = data.user?.name ? "Вы вошли как " + data.user.name : "";
      if (guest) guest.hidden = true;
      if (form) form.hidden = false;
    } catch (_) {
      csrf = "";
      if (userLabel) userLabel.textContent = "";
      if (guest) guest.hidden = false;
      if (form) form.hidden = true;
    }
  }

  text?.addEventListener("input", () => {
    if (counter) counter.textContent = text.value.length + " / 2000";
  });

  form?.addEventListener("submit", async event => {
    event.preventDefault();
    const body = text?.value.trim() || "";

    if (body.length < 2) {
      setStatus("Введите сообщение.", "error");
      return;
    }
    if (!csrf) {
      setStatus("Войдите в аккаунт, чтобы отправить сообщение.", "error");
      return;
    }

    submit.disabled = true;
    setStatus("Отправка...");

    try {
      const response = await fetch(postUrl, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          "content-type": "application/json",
          "X-CSRF-Token": csrf
        },
        body: JSON.stringify({ body })
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || "Не удалось отправить сообщение.");

      text.value = "";
      if (counter) counter.textContent = "0 / 2000";
      setStatus("Сообщение опубликовано.", "success");
      await loadMessages();
    } catch (error) {
      if (error.message === "Сессия устарела. Обновите страницу.") {
        await loadUser();
      }
      setStatus(error.message || "Не удалось отправить сообщение.", "error");
    } finally {
      submit.disabled = false;
    }
  });

  refresh?.addEventListener("click", loadMessages);

  loadUser();
  loadMessages();
})();

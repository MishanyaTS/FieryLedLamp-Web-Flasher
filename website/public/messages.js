(() => {
  "use strict";
  const root = document.getElementById("pmApp");
  if (!root) return;
  const access = document.getElementById("pmAccess");
  const threadsEl = document.getElementById("pmThreads");
  const resultsEl = document.getElementById("pmSearchResults");
  const searchEl = document.getElementById("pmSearch");
  const messagesEl = document.getElementById("pmMessages");
  const peerEl = document.getElementById("pmPeer");
  const form = document.getElementById("pmForm");
  const textEl = document.getElementById("pmText");
  const sendEl = document.getElementById("pmSend");
  const unreadEl = document.getElementById("pmUnread");
  const counterEl = document.getElementById("pmCounter");
  const statusEl = document.getElementById("pmStatus");
  let csrf = "";
  let meId = 0;
  let current = null;
  let inbox = [];
  let opening = 0;
  let searching = 0;
  let searchTimer = null;
  let busy = false;

  async function request(action, options = {}, query = {}) {
    const params = new URLSearchParams({ action, ...query });
    const response = await fetch("/api/index.php?" + params.toString(), {
      method: options.method || "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: options.method === "POST"
        ? { "content-type": "application/json", "X-CSRF-Token": csrf }
        : {},
      body: options.method === "POST" ? JSON.stringify(options.data || {}) : undefined,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) {
      throw new Error(result.message || "Не удалось выполнить запрос.");
    }
    return result;
  }

  function status(message = "", error = false) {
    statusEl.textContent = message;
    statusEl.classList.toggle("error", error);
  }

  function node(tag, className, value) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (value !== undefined) el.textContent = String(value);
    return el;
  }

  function avatar(user) {
    const el = node("span", "pm-avatar");
    if (user.avatarUrl) {
      const img = document.createElement("img");
      img.src = user.avatarUrl;
      img.alt = "";
      img.loading = "lazy";
      el.appendChild(img);
    } else {
      el.textContent = (user.name || "?").trim().slice(0, 1).toUpperCase() || "?";
    }
    return el;
  }

  function shortDate(value) {
    if (!value) return "";
    return String(value).slice(5, 16).replace("-", ".");
  }

  function renderInbox() {
    threadsEl.replaceChildren();
    if (!inbox.length) {
      threadsEl.appendChild(node("p", "pm-muted", "Переписок пока нет. Найдите пользователя выше."));
      return;
    }
    inbox.forEach(thread => {
      const button = node("button", "pm-thread");
      button.type = "button";
      if (current && Number(current.threadId) === Number(thread.id)) button.classList.add("is-active");
      button.appendChild(avatar(thread.other));
      const copy = node("span", "pm-thread-body");
      copy.appendChild(node("b", "", thread.other.name));
      const last = thread.lastBody || "Новая переписка";
      copy.appendChild(node("small", "", (thread.lastSenderId === meId ? "Вы: " : "") + last));
      button.appendChild(copy);
      if (thread.unread > 0) button.appendChild(node("span", "pm-thread-badge", thread.unread));
      button.setAttribute("aria-label", "Переписка с " + thread.other.name);
      button.addEventListener("click", () => openThread({ threadId: thread.id }));
      threadsEl.appendChild(button);
    });
  }

  async function loadInbox() {
    const data = await request("pm-inbox");
    inbox = data.threads || [];
    const count = Number(data.unread || 0);
    unreadEl.textContent = "Новых: " + count;
    unreadEl.hidden = count === 0;
    renderInbox();
  }

  function renderMessages(data) {
    const nearBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 80;
    messagesEl.replaceChildren();
    if (!data.messages || !data.messages.length) {
      messagesEl.appendChild(node("p", "pm-muted", "Сообщений пока нет. Напишите первым."));
      return;
    }
    data.messages.forEach(msg => {
      const mine = Number(msg.senderId) === meId;
      const bubble = node("article", "pm-bubble" + (mine ? " is-mine" : ""));
      bubble.appendChild(node("div", "pm-bubble-text", msg.body));
      const meta = node("small", "pm-bubble-meta", shortDate(msg.createdAt) + (mine && msg.read ? " · прочитано" : ""));
      bubble.appendChild(meta);
      messagesEl.appendChild(bubble);
    });
    if (nearBottom || opening > 0) messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function openThread(target, quiet = false) {
    const seq = ++opening;
    if (!quiet) {
      status("");
      peerEl.textContent = "Загрузка…";
    }
    try {
      const query = target.threadId ? { thread: String(target.threadId) } : { user: String(target.userId) };
      const data = await request("pm-thread", {}, query);
      if (seq !== opening) return;
      current = { threadId: data.threadId, userId: data.other.id, name: data.other.name };
      peerEl.textContent = data.other.name;
      document.getElementById("pmPrivacy").textContent = "Личная переписка · только два участника";
      form.hidden = false;
      root.classList.add("has-thread");
      renderMessages(data);
      renderInbox();
      const unread = (data.messages || []).some(m => Number(m.senderId) !== meId && !m.read);
      if (unread && data.threadId) {
        await request("pm-read", { method: "POST", data: { threadId: data.threadId } });
        await loadInbox();
      }
    } catch (error) {
      if (seq === opening) status(error.message, true);
    }
  }

  async function findUsers(query) {
    const seq = ++searching;
    resultsEl.replaceChildren();
    if (query.trim().length < 2) return;
    try {
      const data = await request("pm-users", {}, { q: query.trim() });
      if (seq !== searching) return;
      if (!data.users.length) {
        resultsEl.appendChild(node("p", "pm-muted", "Пользователи не найдены."));
        return;
      }
      data.users.forEach(user => {
        const item = node("button", "pm-result");
        item.type = "button";
        item.appendChild(avatar(user));
        const body = node("span", "pm-result-body");
        body.appendChild(node("b", "", user.name));
        item.appendChild(body);
        item.addEventListener("click", () => {
          ++searching;
          resultsEl.replaceChildren();
          searchEl.value = "";
          openThread({ userId: user.id }).then(() => textEl.focus());
        });
        resultsEl.appendChild(item);
      });
    } catch (error) {
      if (seq === searching) resultsEl.appendChild(node("p", "pm-muted", error.message));
    }
  }

  searchEl.addEventListener("input", () => {
    clearTimeout(searchTimer);
    const query = searchEl.value;
    ++searching;
    resultsEl.replaceChildren();
    if (query.trim().length < 2) return;
    searchTimer = setTimeout(() => findUsers(query), 250);
  });
  document.getElementById("pmReload").addEventListener("click", async () => {
    try {
      await loadInbox();
      if (current) await openThread(current, true);
    } catch (error) { status(error.message, true); }
  });
  document.getElementById("pmBack").addEventListener("click", () => root.classList.remove("has-thread"));
  textEl.addEventListener("input", () => {
    counterEl.textContent = textEl.value.length + " / 3000";
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!current || busy || !textEl.value.trim()) return;
    busy = true;
    sendEl.disabled = true;
    status("");
    const body = textEl.value.trim();
    try {
      const data = await request("pm-send", {
        method: "POST",
        data: current.threadId ? { threadId: current.threadId, body } : { userId: current.userId, body },
      });
      textEl.value = "";
      counterEl.textContent = "0 / 3000";
      await openThread({ threadId: data.threadId }, true);
      await loadInbox();
    } catch (error) {
      status(error.message, true);
    } finally {
      busy = false;
      sendEl.disabled = false;
    }
  });

  async function initialize() {
    try {
      const response = await (window.FierySession
        ? window.FierySession.get()
        : fetch("/api/index.php?action=me", { credentials: "same-origin", cache: "no-store" }));
      const session = await response.json().catch(() => ({}));
      if (!response.ok || !session.ok || !session.csrf) {
        access.replaceChildren(node("span", "", "Для личных сообщений необходимо войти в аккаунт. "));
        const link = node("a", "", "Войти");
        link.href = "/login.html?next=%2Fmessages.html";
        access.appendChild(link);
        return;
      }
      csrf = session.csrf;
      const self = await request("pm-inbox");
      inbox = self.threads || [];
      const count = Number(self.unread || 0);
      unreadEl.textContent = "Новых: " + count;
      unreadEl.hidden = count === 0;
      renderInbox();
      // The inbox does not include the current user's numeric id.
      // It is returned by pm-thread when a conversation is selected.
      const who = new URLSearchParams(location.search).get("user");
      access.hidden = true;
      root.hidden = false;
      if (who && /^\d+$/.test(who)) {
        const uid = Number(who);
        if (uid > 0 && Number.isSafeInteger(uid)) {
          const data = await request("pm-thread", {}, { user: String(uid) });
          meId = Number(data.meId || 0);
          await openThread({ userId: uid });
        }
      }
      if (!meId) {
        // A current-user id is needed for the direction/read indicator.
        // The account API supplies it via a message-specific authenticated endpoint.
        const identity = await request("pm-unread");
        meId = Number(identity.meId || 0);
      }
    } catch (error) {
      access.textContent = error.message || "Не удалось загрузить сообщения.";
      access.hidden = false;
      root.hidden = true;
    }
  }

  initialize();
  setInterval(async () => {
    if (!csrf || document.hidden || busy) return;
    try {
      await loadInbox();
      if (current) await openThread(current, true);
    } catch (_) { /* The next refresh will retry. */ }
  }, 30000);
})();

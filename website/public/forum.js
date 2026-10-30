(() => {
  const meUrl = "/api/index.php?action=me";
  const listBase = "/api/index.php?action=discussion-list";
  const postUrl = "/api/index.php?action=discussion-post";

  const posts = document.querySelector("#forumPosts");
  const topPager = document.querySelector("#forumPaginationTop");
  const bottomPager = document.querySelector("#forumPaginationBottom");
  const pageInfo = document.querySelector("#forumPageInfo");
  const guest = document.querySelector("#forumGuest");
  const form = document.querySelector("#forumForm");
  const text = document.querySelector("#forumText");
  const counter = document.querySelector("#forumCounter");
  const status = document.querySelector("#forumStatus");
  const submit = document.querySelector("#forumSubmit");
  const userLabel = document.querySelector("#forumUser");

  if (!posts) return;

  let csrf = "";
  let currentPage = Math.max(1, Number(new URLSearchParams(location.search).get("page")) || 1);

  const initials = name => {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toUpperCase();
  };

  function setStatus(message = "", type = "") {
    if (!status) return;
    status.textContent = message;
    status.className = "forum-status" + (type ? " " + type : "");
  }

  function createPost(item, number) {
    const article = document.createElement("article");
    article.className = "forum-post";
    article.id = "post-" + number;

    const authorPanel = document.createElement("aside");
    authorPanel.className = "forum-author-panel";

    const avatar = document.createElement("div");
    avatar.className = "forum-avatar";
    avatar.textContent = initials(item.author);

    const identity = document.createElement("div");
    const name = document.createElement("span");
    name.className = "forum-author-name";
    name.textContent = String(item.author || "Пользователь");
    identity.appendChild(name);

    if (item.isAdmin) {
      const role = document.createElement("span");
      role.className = "forum-role";
      role.textContent = "Администратор";
      identity.appendChild(role);
    }

    const stats = document.createElement("div");
    stats.className = "forum-author-stats";
    const joined = document.createElement("span");
    joined.append("Регистрация: ");
    const joinedValue = document.createElement("b");
    joinedValue.textContent = String(item.joinedAt || "-");
    joined.appendChild(joinedValue);
    const count = document.createElement("span");
    count.append("Сообщений: ");
    const countValue = document.createElement("b");
    countValue.textContent = String(item.userPosts || 0);
    count.appendChild(countValue);
    stats.append(joined, count);
    authorPanel.append(avatar, identity, stats);

    const main = document.createElement("div");
    main.className = "forum-post-main";

    const top = document.createElement("div");
    top.className = "forum-post-top";
    const date = document.createElement("span");
    date.textContent = String(item.createdAt || "");
    const anchor = document.createElement("a");
    anchor.className = "forum-post-number";
    anchor.href = "#post-" + number;
    anchor.textContent = "#" + number;
    top.append(date, anchor);

    const body = document.createElement("div");
    body.className = "forum-post-body";
    body.textContent = String(item.body || "");

    main.append(top, body);
    article.append(authorPanel, main);
    return article;
  }

  function button(label, page, active = false, disabled = false) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "forum-page-button" + (active ? " active" : "");
    el.textContent = label;
    el.disabled = disabled;
    if (!disabled && !active) el.addEventListener("click", () => goPage(page));
    return el;
  }

  function renderPager(target, pagination) {
    if (!target) return;
    target.replaceChildren();
    const page = Number(pagination.page || 1);
    const pages = Number(pagination.pages || 1);
    if (pages <= 1) return;

    target.appendChild(button("‹", page - 1, false, page <= 1));
    let start = Math.max(1, page - 2);
    let end = Math.min(pages, start + 4);
    start = Math.max(1, end - 4);

    if (start > 1) {
      target.appendChild(button("1", 1));
      if (start > 2) {
        const dots = document.createElement("span");
        dots.className = "forum-page-info";
        dots.textContent = "…";
        target.appendChild(dots);
      }
    }

    for (let p = start; p <= end; p++) target.appendChild(button(String(p), p, p === page));

    if (end < pages) {
      if (end < pages - 1) {
        const dots = document.createElement("span");
        dots.className = "forum-page-info";
        dots.textContent = "…";
        target.appendChild(dots);
      }
      target.appendChild(button(String(pages), pages));
    }
    target.appendChild(button("›", page + 1, false, page >= pages));
  }

  function goPage(page) {
    const url = new URL(location.href);
    if (page <= 1) url.searchParams.delete("page");
    else url.searchParams.set("page", String(page));
    history.pushState({}, "", url);
    currentPage = page;
    loadPosts(true);
  }

  async function loadPosts(scroll = false) {
    try {
      const response = await fetch(listBase + "&page=" + currentPage, { credentials: "same-origin", cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || "Не удалось загрузить сообщения.");

      const firstPost = posts.querySelector(".forum-first-post");
      posts.replaceChildren();
      if (currentPage === 1 && firstPost) posts.appendChild(firstPost);

      const pagination = data.pagination || { page: 1, pages: 1, total: 0, pageSize: 20 };
      currentPage = Number(pagination.page || 1);

      if (!data.messages?.length && currentPage === 1) {
        const empty = document.createElement("div");
        empty.className = "forum-empty";
        empty.textContent = "Ответов пока нет. Вы можете написать первым.";
        posts.appendChild(empty);
      } else {
        data.messages.forEach((item, index) => {
          const number = ((currentPage - 1) * Number(pagination.pageSize || 20)) + index + 2;
          posts.appendChild(createPost(item, number));
        });
      }

      if (pageInfo) {
        const totalPosts = Number(pagination.total || 0) + 1;
        pageInfo.textContent = "Страница " + currentPage + " из " + Number(pagination.pages || 1) + " · сообщений в теме: " + totalPosts;
      }
      renderPager(topPager, pagination);
      renderPager(bottomPager, pagination);

      if (scroll) document.querySelector(".forum-thread-head")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      const firstPost = posts.querySelector(".forum-first-post");
      posts.replaceChildren();
      if (currentPage === 1 && firstPost) posts.appendChild(firstPost);
      const box = document.createElement("div");
      box.className = "forum-empty";
      box.textContent = error.message || "Не удалось загрузить сообщения.";
      posts.appendChild(box);
      if (pageInfo) pageInfo.textContent = "Сообщения недоступны";
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
    if (counter) counter.textContent = text.value.length + " / 4000";
  });

  form?.addEventListener("submit", async event => {
    event.preventDefault();
    const body = text?.value.trim() || "";
    if (body.length < 2) {
      setStatus("Введите сообщение.", "error");
      return;
    }
    if (!csrf) {
      setStatus("Войдите в аккаунт, чтобы ответить.", "error");
      return;
    }

    submit.disabled = true;
    setStatus("Отправка...");
    try {
      const response = await fetch(postUrl, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({ body })
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || "Не удалось отправить сообщение.");

      text.value = "";
      if (counter) counter.textContent = "0 / 4000";
      setStatus("Сообщение опубликовано.", "success");
      currentPage = Number(data.page || currentPage);
      const url = new URL(location.href);
      if (currentPage <= 1) url.searchParams.delete("page"); else url.searchParams.set("page", String(currentPage));
      history.replaceState({}, "", url);
      await loadPosts();
      const last = posts.querySelector(".forum-post:last-of-type");
      last?.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (error) {
      if (error.message === "Сессия устарела. Обновите страницу.") await loadUser();
      setStatus(error.message || "Не удалось отправить сообщение.", "error");
    } finally {
      submit.disabled = false;
    }
  });

  addEventListener("popstate", () => {
    currentPage = Math.max(1, Number(new URLSearchParams(location.search).get("page")) || 1);
    loadPosts();
  });

  loadUser();
  loadPosts();
})();

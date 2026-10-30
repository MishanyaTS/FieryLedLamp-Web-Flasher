(() => {
  const meUrl = "/api/index.php?action=me";
  const listBase = "/api/index.php?action=discussion-list";
  const postUrl = "/api/index.php?action=discussion-post";
  const editUrl = "/api/index.php?action=discussion-edit";
  const likeUrl = "/api/index.php?action=discussion-like";
  const deleteUrl = "/api/index.php?action=discussion-delete";

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
  const editorTitle = document.querySelector("#forumEditorTitle");
  const replyContext = document.querySelector("#forumReplyContext");
  const replyLabel = document.querySelector("#forumReplyLabel");
  const replySnippet = document.querySelector("#forumReplySnippet");
  const replyCancel = document.querySelector("#forumReplyCancel");
  const editCancel = document.querySelector("#forumEditCancel");
  const fileInput = document.querySelector("#forumFiles");
  const filesPreview = document.querySelector("#forumFilesPreview");
  const emojiButton = document.querySelector("#forumEmojiButton");
  const emojiPanel = document.querySelector("#forumEmojiPanel");
  const fontSelect = document.querySelector("#forumFont");
  const sizeSelect = document.querySelector("#forumSize");
  const colorInput = document.querySelector("#forumColor");
  const quoteSelection = document.querySelector("#forumQuoteSelection");

  if (!posts) return;

  const firstPostTemplate = posts.querySelector(".forum-first-post")?.cloneNode(true) || null;
  const messageMap = new Map();
  let csrf = "";
  let viewer = null;
  let currentPage = Math.max(1, Number(new URLSearchParams(location.search).get("page")) || 1);
  let replyToId = 0;
  let editingId = 0;
  let pendingFiles = [];

  const escapeHtml = value => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const initials = name => {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toUpperCase();
  };

  const safeAuthorTag = name => String(name || "Пользователь").replace(/[\]\r\n]/g, " ").slice(0, 80);

  function formatBytes(value) {
    const n = Number(value || 0);
    if (n < 1024) return n + " Б";
    if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + " КБ";
    return (n / (1024 * 1024)).toFixed(1) + " МБ";
  }

  function renderMarkup(raw) {
    let html = escapeHtml(raw || "");

    for (let pass = 0; pass < 3; pass++) {
      html = html.replace(/\[quote author=([^\]\n]{1,80})\]([\s\S]*?)\[\/quote\]/gi,
        '<blockquote class="forum-quote"><b>$1 написал(а):</b><div class="forum-quote-content">$2</div></blockquote>');
      html = html.replace(/\[quote\]([\s\S]*?)\[\/quote\]/gi,
        '<blockquote class="forum-quote"><div class="forum-quote-content">$1</div></blockquote>');
      html = html.replace(/\[b\]([\s\S]*?)\[\/b\]/gi, "<strong>$1</strong>");
      html = html.replace(/\[i\]([\s\S]*?)\[\/i\]/gi, "<em>$1</em>");
      html = html.replace(/\[u\]([\s\S]*?)\[\/u\]/gi, "<u>$1</u>");
      html = html.replace(/\[s\]([\s\S]*?)\[\/s\]/gi, "<s>$1</s>");
      html = html.replace(/\[color=(#[0-9a-f]{6})\]([\s\S]*?)\[\/color\]/gi, '<span style="color:$1">$2</span>');
      html = html.replace(/\[size=(12|14|16|18|20|24|28|32)\]([\s\S]*?)\[\/size\]/gi, '<span style="font-size:$1px">$2</span>');
      html = html.replace(/\[font=(Arial|Verdana|Georgia|Tahoma|Trebuchet MS|Courier New)\]([\s\S]*?)\[\/font\]/gi, '<span style="font-family:$1">$2</span>');
    }

    return html.replace(/\n/g, "<br>");
  }

  function setStatus(message = "", type = "") {
    if (!status) return;
    status.textContent = message;
    status.className = "forum-status" + (type ? " " + type : "");
  }

  function loginForForum() {
    const next = location.pathname + location.search + "#reply";
    location.href = "/login.html?next=" + encodeURIComponent(next);
  }

  async function jsonAction(url, payload) {
    if (!csrf) {
      loginForForum();
      throw new Error("Требуется вход в аккаунт.");
    }
    const response = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        "X-CSRF-Token": csrf
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.message || "Ошибка сервера.");
    return data;
  }

  function wrapSelection(open, close) {
    if (!text) return;
    const start = text.selectionStart ?? text.value.length;
    const end = text.selectionEnd ?? start;
    const selected = text.value.slice(start, end);
    const replacement = open + selected + close;
    text.setRangeText(replacement, start, end, "select");
    if (!selected) {
      const pos = start + open.length;
      text.setSelectionRange(pos, pos);
    }
    text.focus();
    updateCounter();
  }

  function insertAtCursor(value) {
    if (!text) return;
    const start = text.selectionStart ?? text.value.length;
    const end = text.selectionEnd ?? start;
    text.setRangeText(value, start, end, "end");
    text.focus();
    updateCounter();
  }

  function updateCounter() {
    if (counter && text) counter.textContent = text.value.length + " / 12000";
  }

  function renderPendingFiles() {
    if (!filesPreview) return;
    filesPreview.replaceChildren();
    pendingFiles.forEach((file, index) => {
      const row = document.createElement("div");
      row.className = "forum-file-pending";
      const icon = document.createElement("span");
      icon.textContent = "📎";
      const name = document.createElement("span");
      name.textContent = file.name + " · " + formatBytes(file.size);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "×";
      remove.title = "Убрать файл";
      remove.addEventListener("click", () => {
        pendingFiles.splice(index, 1);
        renderPendingFiles();
      });
      row.append(icon, name, remove);
      filesPreview.appendChild(row);
    });
  }

  function clearEditorMode(clearText = false) {
    replyToId = 0;
    editingId = 0;
    pendingFiles = [];
    renderPendingFiles();
    if (fileInput) fileInput.value = "";
    if (replyContext) replyContext.hidden = true;
    if (editCancel) editCancel.hidden = true;
    if (editorTitle) editorTitle.textContent = "Написать сообщение";
    if (submit) submit.textContent = "Ответить";
    if (clearText && text) text.value = "";
    updateCounter();
  }

  function startReply(item, quote = false) {
    if (!csrf) {
      loginForForum();
      return;
    }
    editingId = 0;
    replyToId = Number(item.id || 0);
    if (editCancel) editCancel.hidden = true;
    if (replyContext) replyContext.hidden = false;
    if (replyLabel) replyLabel.textContent = "Ответ пользователю " + item.author;
    if (replySnippet) replySnippet.textContent = String(item.body || "").replace(/\[[^\]]+\]/g, "").slice(0, 180);
    if (editorTitle) editorTitle.textContent = "Ответ для " + item.author;
    if (submit) submit.textContent = "Ответить";
    if (quote) {
      const body = String(item.body || "").slice(0, 3000);
      insertAtCursor("[quote author=" + safeAuthorTag(item.author) + "]" + body + "[/quote]\n\n");
    }
    document.querySelector("#reply")?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => text?.focus(), 300);
  }

  function startEdit(item) {
    if (!item.canEdit || !text) return;
    replyToId = 0;
    editingId = Number(item.id);
    pendingFiles = [];
    renderPendingFiles();
    text.value = String(item.body || "");
    updateCounter();
    if (replyContext) replyContext.hidden = true;
    if (editCancel) editCancel.hidden = false;
    if (editorTitle) editorTitle.textContent = "Редактирование сообщения #" + item.number;
    if (submit) submit.textContent = "Сохранить";
    document.querySelector("#reply")?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => text.focus(), 300);
  }

  function attachmentElement(att) {
    const link = document.createElement("a");
    link.className = "forum-attachment";
    link.href = att.url;
    link.target = "_blank";
    link.rel = "noopener";

    if (String(att.mime || "").startsWith("image/")) {
      const img = document.createElement("img");
      img.className = "forum-attachment-thumb";
      img.src = att.url;
      img.alt = "";
      img.loading = "lazy";
      link.appendChild(img);
    } else {
      const icon = document.createElement("span");
      icon.className = "forum-attachment-icon";
      icon.textContent = String(att.mime || "").includes("pdf") ? "PDF" : String(att.mime || "").includes("zip") ? "ZIP" : "TXT";
      link.appendChild(icon);
    }

    const info = document.createElement("span");
    info.className = "forum-attachment-info";
    const name = document.createElement("b");
    name.textContent = String(att.name || "Файл");
    const size = document.createElement("small");
    size.textContent = formatBytes(att.size);
    info.append(name, size);
    link.appendChild(info);
    return link;
  }

  function actionButton(label, className = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "forum-action" + (className ? " " + className : "");
    button.textContent = label;
    return button;
  }

  function createPost(item, number) {
    item.number = number;
    messageMap.set(Number(item.id), item);

    const article = document.createElement("article");
    article.className = "forum-post" + (item.deleted ? " forum-post-is-deleted" : "");
    article.id = "post-" + number;
    article.dataset.messageId = String(item.id);

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
    if (item.editedAt) {
      const edited = document.createElement("span");
      edited.className = "forum-post-edited";
      edited.textContent = "изменено " + item.editedAt;
      date.appendChild(edited);
    }
    const anchor = document.createElement("a");
    anchor.className = "forum-post-number";
    anchor.href = "#post-" + number;
    anchor.textContent = "#" + number;
    top.append(date, anchor);
    main.appendChild(top);

    if (item.replyTo) {
      const preview = document.createElement("div");
      preview.className = "forum-reply-preview";
      const arrow = document.createElement("span");
      arrow.textContent = "↪";
      const copy = document.createElement("div");
      const who = document.createElement("b");
      who.textContent = "Ответ пользователю " + item.replyTo.author;
      const snippet = document.createElement("span");
      snippet.textContent = item.replyTo.snippet || "";
      copy.append(who, snippet);
      preview.append(arrow, copy);
      main.appendChild(preview);
    }

    if (item.deleted) {
      const deleted = document.createElement("div");
      deleted.className = "forum-deleted";
      deleted.textContent = "Сообщение удалено.";
      main.appendChild(deleted);
    } else {
      const body = document.createElement("div");
      body.className = "forum-post-body";
      body.innerHTML = renderMarkup(item.body || "");
      main.appendChild(body);

      if (Array.isArray(item.attachments) && item.attachments.length) {
        const attachments = document.createElement("div");
        attachments.className = "forum-attachments";
        item.attachments.forEach(att => attachments.appendChild(attachmentElement(att)));
        main.appendChild(attachments);
      }

      const actions = document.createElement("div");
      actions.className = "forum-post-actions";

      const like = actionButton("♥ " + Number(item.likes || 0), "like" + (item.likedByMe ? " active" : ""));
      like.title = item.likedByMe ? "Убрать лайк" : "Нравится";
      like.addEventListener("click", async () => {
        if (!csrf) return loginForForum();
        try {
          const data = await jsonAction(likeUrl, { id: item.id });
          item.likedByMe = data.liked;
          item.likes = data.likes;
          like.classList.toggle("active", data.liked);
          like.textContent = "♥ " + data.likes;
        } catch (error) {
          setStatus(error.message, "error");
        }
      });

      const reply = actionButton("↩ Ответить");
      reply.addEventListener("click", () => startReply(item, false));

      const quote = actionButton("❝ Цитировать");
      quote.addEventListener("click", () => startReply(item, true));

      actions.append(like, reply, quote);

      if (item.canEdit) {
        const edit = actionButton("✎ Изменить");
        edit.addEventListener("click", () => startEdit(item));
        actions.appendChild(edit);
      }

      if (item.canDelete) {
        const remove = actionButton("Удалить", "danger");
        remove.addEventListener("click", async () => {
          if (!confirm("Удалить это сообщение?")) return;
          try {
            await jsonAction(deleteUrl, { id: item.id });
            if (editingId === Number(item.id)) clearEditorMode(true);
            await loadPosts();
          } catch (error) {
            setStatus(error.message, "error");
          }
        });
        actions.appendChild(remove);
      }

      main.appendChild(actions);
    }

    article.append(authorPanel, main);
    return article;
  }

  function setupStarterPost() {
    const starter = posts.querySelector(".forum-first-post");
    const main = starter?.querySelector(".forum-post-main");
    const body = starter?.querySelector(".forum-post-body");
    if (!main || !body || main.querySelector(".forum-post-actions")) return;

    const actions = document.createElement("div");
    actions.className = "forum-post-actions";

    const reply = actionButton("↩ Ответить");
    reply.addEventListener("click", () => {
      if (!csrf) return loginForForum();
      clearEditorMode(false);
      if (editorTitle) editorTitle.textContent = "Ответ для MishanyaTS";
      document.querySelector("#reply")?.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => text?.focus(), 300);
    });

    const quote = actionButton("❝ Цитировать");
    quote.addEventListener("click", () => {
      if (!csrf) return loginForForum();
      const content = body.textContent.trim().slice(0, 3000);
      clearEditorMode(false);
      insertAtCursor("[quote author=MishanyaTS]" + content + "[/quote]\n\n");
      document.querySelector("#reply")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    actions.append(reply, quote);
    main.appendChild(actions);
  }

  function pageButton(label, page, active = false, disabled = false) {
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

    target.appendChild(pageButton("‹", page - 1, false, page <= 1));
    let start = Math.max(1, page - 2);
    let end = Math.min(pages, start + 4);
    start = Math.max(1, end - 4);

    if (start > 1) {
      target.appendChild(pageButton("1", 1));
      if (start > 2) {
        const dots = document.createElement("span");
        dots.className = "forum-page-info";
        dots.textContent = "…";
        target.appendChild(dots);
      }
    }

    for (let p = start; p <= end; p++) target.appendChild(pageButton(String(p), p, p === page));

    if (end < pages) {
      if (end < pages - 1) {
        const dots = document.createElement("span");
        dots.className = "forum-page-info";
        dots.textContent = "…";
        target.appendChild(dots);
      }
      target.appendChild(pageButton(String(pages), pages));
    }
    target.appendChild(pageButton("›", page + 1, false, page >= pages));
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

      messageMap.clear();
      posts.replaceChildren();
      if (currentPage === 1 && firstPostTemplate) posts.appendChild(firstPostTemplate.cloneNode(true));

      const pagination = data.pagination || { page: 1, pages: 1, total: 0, pageSize: 20 };
      currentPage = Number(pagination.page || 1);
      viewer = data.viewer || viewer;

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

      setupStarterPost();

      if (pageInfo) {
        const totalPosts = Number(pagination.total || 0) + 1;
        pageInfo.textContent = "Страница " + currentPage + " из " + Number(pagination.pages || 1) + " · сообщений в теме: " + totalPosts;
      }
      renderPager(topPager, pagination);
      renderPager(bottomPager, pagination);

      if (scroll) document.querySelector(".forum-thread-head")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      posts.replaceChildren();
      if (currentPage === 1 && firstPostTemplate) posts.appendChild(firstPostTemplate.cloneNode(true));
      setupStarterPost();
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
      viewer = data.user || null;
      if (userLabel) userLabel.textContent = data.user?.name ? "Вы вошли как " + data.user.name : "";
      if (guest) guest.hidden = true;
      if (form) form.hidden = false;
    } catch (_) {
      csrf = "";
      viewer = null;
      if (userLabel) userLabel.textContent = "";
      if (guest) guest.hidden = false;
      if (form) form.hidden = true;
    }
  }

  async function submitMessage(event) {
    event.preventDefault();
    const body = text?.value.trim() || "";
    if (body.length < 2) {
      setStatus("Введите сообщение.", "error");
      return;
    }
    if (!csrf) {
      loginForForum();
      return;
    }

    const wasEditing = editingId > 0;
    submit.disabled = true;
    setStatus(wasEditing ? "Сохранение..." : "Отправка...");

    try {
      const data = new FormData();
      data.append("body", body);
      if (replyToId) data.append("parentId", String(replyToId));
      if (editingId) data.append("id", String(editingId));
      pendingFiles.forEach(file => data.append("files[]", file, file.name));

      const response = await fetch(editingId ? editUrl : postUrl, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "X-CSRF-Token": csrf },
        body: data
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.message || "Не удалось сохранить сообщение.");

      if (!editingId && result.page) {
        currentPage = Number(result.page);
        const url = new URL(location.href);
        if (currentPage <= 1) url.searchParams.delete("page");
        else url.searchParams.set("page", String(currentPage));
        history.replaceState({}, "", url);
      }

      clearEditorMode(true);
      setStatus(wasEditing ? "Сообщение изменено." : "Сообщение опубликовано.", "success");
      await loadPosts();
      const last = posts.querySelector(".forum-post:last-of-type");
      last?.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (error) {
      if (error.message === "Сессия устарела. Обновите страницу.") await loadUser();
      setStatus(error.message || "Не удалось сохранить сообщение.", "error");
    } finally {
      submit.disabled = false;
    }
  }

  document.querySelectorAll(".forum-tool[data-format]").forEach(button => {
    button.addEventListener("click", () => {
      const tag = button.dataset.format;
      wrapSelection("[" + tag + "]", "[/" + tag + "]");
    });
  });

  fontSelect?.addEventListener("change", () => {
    if (fontSelect.value) wrapSelection("[font=" + fontSelect.value + "]", "[/font]");
    fontSelect.value = "";
  });

  sizeSelect?.addEventListener("change", () => {
    if (sizeSelect.value) wrapSelection("[size=" + sizeSelect.value + "]", "[/size]");
    sizeSelect.value = "";
  });

  colorInput?.addEventListener("change", () => {
    wrapSelection("[color=" + colorInput.value + "]", "[/color]");
  });

  quoteSelection?.addEventListener("click", () => wrapSelection("[quote]", "[/quote]"));

  emojiButton?.addEventListener("click", event => {
    event.stopPropagation();
    if (emojiPanel) emojiPanel.hidden = !emojiPanel.hidden;
  });

  emojiPanel?.querySelectorAll("button").forEach(button => {
    button.addEventListener("click", () => {
      insertAtCursor(button.textContent);
      emojiPanel.hidden = true;
    });
  });

  document.addEventListener("click", event => {
    if (emojiPanel && !emojiPanel.hidden && !emojiPanel.contains(event.target) && event.target !== emojiButton) emojiPanel.hidden = true;
  });

  fileInput?.addEventListener("change", () => {
    const incoming = [...(fileInput.files || [])];
    for (const file of incoming) {
      if (pendingFiles.length >= 5) break;
      if (!pendingFiles.some(existing => existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified)) {
        pendingFiles.push(file);
      }
    }
    fileInput.value = "";
    renderPendingFiles();
    if (incoming.length && pendingFiles.length >= 5) setStatus("Можно прикрепить не более 5 файлов.", "error");
  });

  replyCancel?.addEventListener("click", () => {
    replyToId = 0;
    if (replyContext) replyContext.hidden = true;
    if (!editingId && editorTitle) editorTitle.textContent = "Написать сообщение";
  });

  editCancel?.addEventListener("click", () => clearEditorMode(true));
  text?.addEventListener("input", updateCounter);
  form?.addEventListener("submit", submitMessage);

  addEventListener("popstate", () => {
    currentPage = Math.max(1, Number(new URLSearchParams(location.search).get("page")) || 1);
    loadPosts();
  });

  loadUser().then(loadPosts);
})();

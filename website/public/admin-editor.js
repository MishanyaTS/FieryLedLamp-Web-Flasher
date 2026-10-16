(() => {
  const root = document.querySelector("#adminEditor");
  if (!root) return;

  const loading = document.querySelector("#editorLoading");
  const app = document.querySelector("#editorApp");
  const fileList = document.querySelector("#editorFileList");
  const search = document.querySelector("#editorSearch");
  const code = document.querySelector("#editorCode");
  const lines = document.querySelector("#editorLines");
  const saveButton = document.querySelector("#editorSave");
  const reloadButton = document.querySelector("#editorReload");
  const openPage = document.querySelector("#editorOpenPage");
  const status = document.querySelector("#editorStatus");
  const dirtyBadge = document.querySelector("#editorDirty");
  const commitLink = document.querySelector("#editorCommit");

  let csrf = "";
  let files = [];
  let currentFile = "";
  let currentLabel = "";
  let currentSha = "";
  let originalContent = "";
  let loadingFile = false;

  const api = (action, options = {}) => fetch("/api/index.php?action=" + action, {
    credentials: "same-origin",
    cache: "no-store",
    ...options
  });

  async function parse(response) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.message || "Ошибка сервера.");
    return data;
  }

  function showStatus(message = "", type = "") {
    status.textContent = message;
    status.className = "site-editor-status" + (type ? " " + type : "");
  }

  function isDirty() {
    return Boolean(currentFile) && code.value !== originalContent;
  }

  function updateDirty() {
    const dirty = isDirty();
    dirtyBadge.hidden = !dirty;
    saveButton.disabled = !currentFile || !dirty || loadingFile;
  }

  function updateLines() {
    const count = Math.max(1, code.value.split("\n").length);
    let text = "";
    for (let i = 1; i <= count; i++) text += i + (i === count ? "" : "\n");
    lines.textContent = text;
    lines.scrollTop = code.scrollTop;
  }

  function setBusy(busy, text = "") {
    loadingFile = busy;
    reloadButton.disabled = busy || !currentFile;
    code.disabled = busy || !currentFile;
    saveButton.disabled = busy || !isDirty();
    if (text) showStatus(text, "info");
  }

  function renderFiles(filter = "") {
    const q = filter.trim().toLowerCase();
    const visible = files.filter(item =>
      !q || item.label.toLowerCase().includes(q) || item.file.toLowerCase().includes(q)
    );

    fileList.innerHTML = "";
    for (const item of visible) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "site-editor-file" + (item.file === currentFile ? " active" : "");
      button.dataset.file = item.file;

      const label = document.createElement("strong");
      label.textContent = item.label;
      const file = document.createElement("span");
      file.textContent = item.file;
      button.append(label, file);

      button.addEventListener("click", () => selectFile(item.file));
      fileList.appendChild(button);
    }

    if (!visible.length) {
      const empty = document.createElement("div");
      empty.className = "site-editor-empty";
      empty.textContent = "Страницы не найдены.";
      fileList.appendChild(empty);
    }
  }

  async function selectFile(file, force = false) {
    if (!force && file === currentFile) return;
    if (!force && isDirty() && !confirm("Есть несохранённые изменения. Открыть другой файл и потерять их?")) return;

    setBusy(true, "Загрузка " + file + "…");
    commitLink.hidden = true;

    try {
      const data = await parse(await api("admin-editor-load&file=" + encodeURIComponent(file)));
      currentFile = data.file;
      currentLabel = data.label;
      currentSha = data.sha;
      originalContent = data.content;

      document.querySelector("#editorPageLabel").textContent = currentLabel;
      document.querySelector("#editorFileName").textContent = currentFile;
      document.querySelector("#editorPath").textContent = "website/public/" + currentFile;
      document.querySelector("#editorSha").textContent = currentSha.slice(0, 12);
      code.value = originalContent;
      openPage.href = "/" + currentFile;
      openPage.removeAttribute("aria-disabled");
      updateLines();
      renderFiles(search.value);
      showStatus("Файл загружен из GitHub.", "success");
    } catch (error) {
      showStatus(error.message, "error");
    } finally {
      setBusy(false);
      updateDirty();
    }
  }

  async function saveFile() {
    if (!currentFile || !isDirty()) return;
    const file = currentFile;
    const content = code.value;
    saveButton.disabled = true;
    saveButton.textContent = "Сохранение…";
    showStatus("Создание коммита в GitHub…", "info");

    try {
      const data = await parse(await api("admin-editor-save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrf
        },
        body: JSON.stringify({
          file,
          content,
          sha: currentSha
        })
      }));

      currentSha = data.sha;
      originalContent = content;
      document.querySelector("#editorSha").textContent = currentSha.slice(0, 12);
      updateDirty();

      if (data.commitUrl) {
        commitLink.href = data.commitUrl;
        commitLink.hidden = false;
      }

      showStatus(
        "Сохранено в GitHub" + (data.commitSha ? " · " + data.commitSha.slice(0, 8) : "") +
        ". Автоматическое обновление сайта может занять некоторое время.",
        "success"
      );
    } catch (error) {
      showStatus(error.message, "error");
    } finally {
      saveButton.textContent = "Сохранить в GitHub";
      updateDirty();
    }
  }

  code.addEventListener("input", () => {
    updateLines();
    updateDirty();
  });

  code.addEventListener("scroll", () => {
    lines.scrollTop = code.scrollTop;
  });

  code.addEventListener("keydown", event => {
    if (event.key === "Tab") {
      event.preventDefault();
      const start = code.selectionStart;
      const end = code.selectionEnd;
      code.setRangeText("  ", start, end, "end");
      code.dispatchEvent(new Event("input"));
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      saveFile();
    }
  });

  search.addEventListener("input", () => renderFiles(search.value));
  saveButton.addEventListener("click", saveFile);
  reloadButton.addEventListener("click", () => {
    if (isDirty() && !confirm("Отменить несохранённые изменения и заново загрузить файл из GitHub?")) return;
    selectFile(currentFile, true);
  });

  window.addEventListener("beforeunload", event => {
    if (!isDirty()) return;
    event.preventDefault();
    event.returnValue = "";
  });

  (async () => {
    try {
      const me = await parse(await api("me"));
      if (!me.user.isAdmin) {
        location.href = "/account.html";
        return;
      }
      csrf = me.csrf || "";

      const data = await parse(await api("admin-editor-files"));
      files = Array.isArray(data.files) ? data.files : [];
      document.querySelector("#editorRepo").textContent = data.repo + " · " + data.branch;
      renderFiles();

      loading.hidden = true;
      app.hidden = false;

      if (!data.githubConfigured) {
        showStatus("GitHub-токен ещё не настроен на сервере. Добавьте github_token в приватный config.php.", "warning");
        return;
      }

      if (files.length) await selectFile(files[0].file, true);
    } catch (error) {
      loading.textContent = error.message;
      loading.classList.add("error");
    }
  })();
})();
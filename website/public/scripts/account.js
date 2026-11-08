(() => {
  const api = (action, options = {}) => {
    if (action === "me" && window.FierySession) return window.FierySession.get();
    if (options.method && options.method !== "GET") window.FierySession?.invalidate();
    return fetch("/api/index.php?action=" + encodeURIComponent(action), {
      credentials: "same-origin", cache: "no-store", ...options,
      headers: { "content-type": "application/json", ...(options.headers || {}) }
    });
  };

  const parse = async response => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.message || "Ошибка сервера.");
    return data;
  };

  const setStatus = (form, message, type = "") => {
    const box = form?.querySelector(".form-status");
    if (!box) return;
    box.textContent = message || "";
    box.className = "form-status" + (type ? " " + type : "");
  };

  const busy = (button, state, text = "Подождите…") => {
    if (!button) return;
    if (state) {
      button.dataset.oldText = button.textContent;
      button.textContent = text;
      button.disabled = true;
    } else {
      button.textContent = button.dataset.oldText || button.textContent;
      button.disabled = false;
    }
  };

  const params = new URLSearchParams(location.search);
  const requestedNext = params.get("next") || "";
  let nextPath = "/account.html";
  if (requestedNext.startsWith("/")) {
    try {
      const next = new URL(requestedNext, location.origin);
      if (next.origin === location.origin) nextPath = next.pathname + next.search + next.hash;
    } catch (_) {}
  }

  const registerForm = document.querySelector("#registerForm");
  if (registerForm) {
    registerForm.addEventListener("submit", async event => {
      event.preventDefault();
      if (registerForm.password.value !== registerForm.password2.value) {
        setStatus(registerForm, "Пароли не совпадают.", "error");
        return;
      }
      const button = registerForm.querySelector("button[type=submit]");
      busy(button, true, "Регистрация…");
      setStatus(registerForm, "");
      try {
        const data = await parse(await api("register", {
          method: "POST",
          body: JSON.stringify({
            name: registerForm.name.value.trim(),
            email: registerForm.email.value.trim(),
            password: registerForm.password.value,
            notifyUpdates: registerForm.notifyUpdates.checked,
            website: registerForm.website.value,
            visitorId: window.FieryAnalytics?.id?.() || ""
          })
        }));
        setStatus(registerForm,
          data.emailSent
            ? "Аккаунт создан. На почту отправлена ссылка подтверждения."
            : "Аккаунт создан, но письмо подтверждения отправить не удалось. Его можно отправить повторно из аккаунта.",
          data.emailSent ? "success" : "error"
        );
        setTimeout(() => location.href = nextPath, 700);
      } catch (error) {
        setStatus(registerForm, error.message, "error");
      } finally {
        busy(button, false);
      }
    });
  }

  const loginForm = document.querySelector("#loginForm");
  if (loginForm) {
    if (params.get("verified") === "1") setStatus(loginForm, "E-mail подтверждён. Теперь можно войти.", "success");
    if (params.get("verified") === "0") setStatus(loginForm, "Ссылка подтверждения недействительна или устарела.", "error");
    if (params.get("reset") === "1") setStatus(loginForm, "Пароль изменён. Войдите с новым паролем.", "success");

    loginForm.addEventListener("submit", async event => {
      event.preventDefault();
      const button = loginForm.querySelector("button[type=submit]");
      busy(button, true, "Вход…");
      try {
        await parse(await api("login", {
          method: "POST",
          body: JSON.stringify({
            email: loginForm.email.value.trim(),
            password: loginForm.password.value,
            remember: loginForm.remember?.checked === true
          })
        }));
        // Do not display a previous account's cached name after a new login.
        window.FieryHeader?.clear();
        location.href = nextPath;
      } catch (error) {
        setStatus(loginForm, error.message, "error");
      } finally {
        busy(button, false);
      }
    });
  }

  const forgotForm = document.querySelector("#forgotForm");
  if (forgotForm) {
    forgotForm.addEventListener("submit", async event => {
      event.preventDefault();
      const button = forgotForm.querySelector("button[type=submit]");
      busy(button, true, "Отправка…");
      try {
        const data = await parse(await api("request-reset", {
          method: "POST",
          body: JSON.stringify({ email: forgotForm.email.value.trim() })
        }));
        setStatus(forgotForm, data.message, "success");
      } catch (error) {
        setStatus(forgotForm, error.message, "error");
      } finally {
        busy(button, false);
      }
    });
  }

  const resetForm = document.querySelector("#resetForm");
  if (resetForm) {
    resetForm.token.value = params.get("token") || "";
    if (!resetForm.token.value) setStatus(resetForm, "В ссылке отсутствует токен восстановления.", "error");

    resetForm.addEventListener("submit", async event => {
      event.preventDefault();
      if (resetForm.password.value !== resetForm.password2.value) {
        setStatus(resetForm, "Пароли не совпадают.", "error");
        return;
      }
      const button = resetForm.querySelector("button[type=submit]");
      busy(button, true, "Сохранение…");
      try {
        await parse(await api("reset-password", {
          method: "POST",
          body: JSON.stringify({
            token: resetForm.token.value,
            password: resetForm.password.value
          })
        }));
        location.href = "/login.html?reset=1";
      } catch (error) {
        setStatus(resetForm, error.message, "error");
      } finally {
        busy(button, false);
      }
    });
  }

  const account = document.querySelector("#accountPanel");
  if (account) {
    let csrf = "";
    let accountUser = null;

    const statusBox = (selector, message, type = "") => {
      const box = document.querySelector(selector);
      if (!box) return;
      box.textContent = message || "";
      box.className = "form-status" + (type ? " " + type : "");
    };

    const initials = name => {
      const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
      return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toUpperCase();
    };

    const setAvatar = (url, name) => {
      const image = document.querySelector("#accountAvatarImage");
      const fallback = document.querySelector("#accountAvatarFallback");
      const remove = document.querySelector("#removeAvatar");
      if (fallback) fallback.textContent = initials(name);
      if (image && url) {
        image.src = url;
        image.hidden = false;
        if (fallback) fallback.hidden = true;
        if (remove) remove.hidden = false;
      } else {
        if (image) {
          image.removeAttribute("src");
          image.hidden = true;
        }
        if (fallback) fallback.hidden = false;
        if (remove) remove.hidden = true;
      }
    };

    const loadAccount = async () => {
      try {
        const data = await parse(await api("me", { headers: {} }));
        csrf = data.csrf;
        accountUser = data.user;
        document.querySelector("#accountName").textContent = data.user.name;
        const accountNameInput = document.querySelector("#accountNameInput");
        if (accountNameInput) accountNameInput.value = data.user.name;
        document.querySelector("#accountEmail").textContent = data.user.email;
        document.querySelector("#accountCreated").textContent = data.user.createdAt || "-";
        document.querySelector("#notifyUpdates").checked = Boolean(data.user.notifyUpdates);
        document.querySelector("#notifyForum").checked = Boolean(data.user.notifyForum);
        document.querySelector("#notifyMessages").checked = Boolean(data.user.notifyMessages);
        setAvatar(data.user.avatarUrl, data.user.name);

        const badge = document.querySelector("#verifyBadge");
        badge.textContent = data.user.verified ? "E-mail подтверждён" : "E-mail не подтверждён";
        badge.className = "auth-badge " + (data.user.verified ? "success" : "warning");
        document.querySelector("#resendVerify").hidden = data.user.verified;

        const adminLink = document.querySelector("#adminNotifyLink");
        if (adminLink) adminLink.hidden = !data.user.isAdmin;
        const adminStatsLink = document.querySelector("#adminStatsLink");
        if (adminStatsLink) adminStatsLink.hidden = !data.user.isAdmin;
        const adminUsersLink = document.querySelector("#adminUsersLink");
        if (adminUsersLink) adminUsersLink.hidden = !data.user.isAdmin;
        const adminPanel = document.querySelector("#accountAdminPanel");
        if (adminPanel) adminPanel.hidden = !data.user.isAdmin;
        const role = document.querySelector("#accountRole");
        if (role) {
          role.textContent = data.user.isAdmin ? "Администратор" : "Пользователь";
          role.classList.toggle("is-admin", Boolean(data.user.isAdmin));
        }

        account.hidden = false;
        document.querySelector("#accountLoading").hidden = true;
      } catch (_) {
        location.href = "/login.html?next=%2Faccount.html";
      }
    };

    const changeNameForm = document.querySelector("#changeNameForm");
    changeNameForm?.addEventListener("submit", async event => {
      event.preventDefault();
      const button = changeNameForm.querySelector("button[type=submit]");
      const input = changeNameForm.querySelector('input[name="name"]');
      const name = input?.value.trim() || "";

      busy(button, true, "Сохранение…");
      try {
        const data = await parse(await api("update-name", {
          method: "POST",
          headers: { "x-csrf-token": csrf },
          body: JSON.stringify({ name })
        }));

        if (accountUser) accountUser.name = data.name;
        window.FieryHeader?.setName(data.name);
        document.querySelector("#accountName").textContent = data.name;
        if (input) input.value = data.name;
        setAvatar(accountUser?.avatarUrl || null, data.name);
        setStatus(changeNameForm, data.message || "Имя изменено.", "success");
      } catch (error) {
        setStatus(changeNameForm, error.message, "error");
      } finally {
        busy(button, false);
      }
    });

    document.querySelector("#savePreferences")?.addEventListener("click", async event => {
      const button = event.currentTarget;
      busy(button, true, "Сохранение…");
      try {
        await parse(await api("preferences", {
          method: "POST",
          headers: { "x-csrf-token": csrf },
          body: JSON.stringify({
            notifyUpdates: document.querySelector("#notifyUpdates").checked,
            notifyForum: document.querySelector("#notifyForum").checked,
            notifyMessages: document.querySelector("#notifyMessages").checked
          })
        }));
        statusBox("#preferencesStatus", "Настройки уведомлений сохранены.", "success");
      } catch (error) {
        statusBox("#preferencesStatus", error.message, "error");
      } finally {
        busy(button, false);
      }
    });

    document.querySelector("#saveAvatar")?.addEventListener("click", async event => {
      const input = document.querySelector("#accountAvatarFile");
      const file = input?.files?.[0];
      if (!file) {
        statusBox("#accountStatus", "Выберите изображение для аватара.", "error");
        return;
      }

      const button = event.currentTarget;
      busy(button, true, "Загрузка…");
      try {
        const formData = new FormData();
        formData.append("avatar", file, file.name);
        window.FierySession?.invalidate();
        const response = await fetch("/api/index.php?action=avatar-update", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "X-CSRF-Token": csrf },
          body: formData
        });
        const data = await parse(response);
        if (accountUser) accountUser.avatarUrl = data.avatarUrl;
        setAvatar(data.avatarUrl, accountUser?.name || "");
        if (input) input.value = "";
        const filename = document.querySelector("#accountAvatarFilename");
        if (filename) filename.textContent = "JPG, PNG или WebP, до 5 МБ.";
        statusBox("#accountStatus", "Аватар обновлён.", "success");
      } catch (error) {
        statusBox("#accountStatus", error.message, "error");
      } finally {
        busy(button, false);
      }
    });

    document.querySelector("#accountAvatarFile")?.addEventListener("change", event => {
      const filename = document.querySelector("#accountAvatarFilename");
      if (filename) filename.textContent = event.currentTarget.files?.[0]?.name || "JPG, PNG или WebP, до 5 МБ.";
    });

    document.querySelector("#removeAvatar")?.addEventListener("click", async event => {
      const button = event.currentTarget;
      busy(button, true, "Удаление…");
      try {
        const formData = new FormData();
        formData.append("remove", "1");
        window.FierySession?.invalidate();
        const response = await fetch("/api/index.php?action=avatar-update", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "X-CSRF-Token": csrf },
          body: formData
        });
        const data = await parse(response);
        if (accountUser) accountUser.avatarUrl = data.avatarUrl;
        setAvatar(data.avatarUrl, accountUser?.name || "");
        statusBox("#accountStatus", "Аватар удалён.", "success");
      } catch (error) {
        statusBox("#accountStatus", error.message, "error");
      } finally {
        busy(button, false);
      }
    });

    const passwordForm = document.querySelector("#changePasswordForm");
    passwordForm?.addEventListener("submit", async event => {
      event.preventDefault();
      if (passwordForm.newPassword.value !== passwordForm.newPassword2.value) {
        setStatus(passwordForm, "Новые пароли не совпадают.", "error");
        return;
      }
      const button = passwordForm.querySelector("button[type=submit]");
      busy(button, true, "Сохранение…");
      try {
        const data = await parse(await api("change-password", {
          method: "POST",
          headers: { "x-csrf-token": csrf },
          body: JSON.stringify({
            currentPassword: passwordForm.currentPassword.value,
            newPassword: passwordForm.newPassword.value
          })
        }));
        passwordForm.reset();
        setStatus(passwordForm, data.message || "Пароль изменён.", "success");
      } catch (error) {
        setStatus(passwordForm, error.message, "error");
      } finally {
        busy(button, false);
      }
    });

    document.querySelector("#resendVerify")?.addEventListener("click", async event => {
      const button = event.currentTarget;
      busy(button, true, "Отправка…");
      try {
        const data = await parse(await api("resend-verification", {
          method: "POST",
          headers: { "x-csrf-token": csrf },
          body: "{}"
        }));
        statusBox("#accountStatus", data.message, "success");
      } catch (error) {
        statusBox("#accountStatus", error.message, "error");
      } finally {
        busy(button, false);
      }
    });

    document.querySelector("#logoutButton")?.addEventListener("click", async () => {
      try {
        await api("logout", { method: "POST", headers: { "x-csrf-token": csrf }, body: "{}" });
      } finally {
        // Remove the cached label so it cannot linger after signing out.
        window.FieryHeader?.clear();
        location.href = "/";
      }
    });

    loadAccount();
  }

  const adminForm = document.querySelector("#adminNotifyForm");
  if (adminForm) {
    let csrf = "";
    const result = document.querySelector("#adminNotifyResult");

    const show = (message, type = "") => {
      result.hidden = false;
      result.textContent = message;
      result.className = "notify-result" + (type ? " " + type : "");
    };

    const loadAdmin = async () => {
      try {
        const me = await parse(await api("me", { headers: {} }));
        if (!me.user.isAdmin) throw new Error("Нет прав администратора.");
        csrf = me.csrf;

        const data = await parse(await api("admin-providers", { headers: {} }));
        document.querySelector("#adminDbState").textContent = "Подключена";
        document.querySelector("#adminMailState").textContent = data.emailConfigured ? "Готов" : "Не настроен";
        document.querySelector("#adminSubscribers").textContent = data.subscribers;
      } catch (error) {
        show(error.message, "error");
        adminForm.querySelectorAll("button,input,textarea").forEach(el => el.disabled = true);
      }
    };

    const send = async dryRun => {
      const button = dryRun ? document.querySelector("#adminDryRun") : document.querySelector("#adminSend");
      busy(button, true, dryRun ? "Проверка…" : "Отправка…");
      try {
        const data = await parse(await api("admin-notify", {
          method: "POST",
          headers: { "x-csrf-token": csrf },
          body: JSON.stringify({
            version: adminForm.version.value.trim(),
            title: adminForm.title.value.trim(),
            summary: adminForm.summary.value.trim(),
            dryRun
          })
        }));
        show(
          dryRun
            ? "Получателей: " + data.planned
            : "Отправлено: " + data.sent + ". Ошибок: " + data.failed + ". Уже отправлялось: " + data.skipped + ".",
          dryRun ? "info" : "success"
        );
      } catch (error) {
        show(error.message, "error");
      } finally {
        busy(button, false);
      }
    };

    document.querySelector("#adminDryRun")?.addEventListener("click", () => send(true));
    adminForm.addEventListener("submit", event => {
      event.preventDefault();
      if (confirm("Отправить уведомление зарегистрированным пользователям?")) send(false);
    });

    loadAdmin();
  }
})();

(() => {
  const passwordInputs = [...document.querySelectorAll('input[type="password"]')];

  passwordInputs.forEach(input => {
    if (input.closest(".password-field")) return;

    const wrapper = document.createElement("div");
    wrapper.className = "password-field";
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "password-visibility-toggle";
    button.setAttribute("aria-label", "Показать пароль");
    button.setAttribute("title", "Показать пароль");
    button.innerHTML = '<span class="password-eye" aria-hidden="true"></span>';
    wrapper.appendChild(button);

    button.addEventListener("click", () => {
      const hidden = input.type === "password";
      input.type = hidden ? "text" : "password";
      button.classList.toggle("visible", hidden);
      button.setAttribute("aria-label", hidden ? "Скрыть пароль" : "Показать пароль");
      button.setAttribute("title", hidden ? "Скрыть пароль" : "Показать пароль");
    });
  });
})();

(() => {
  const menu = document.querySelector(".menu-btn");
  const nav = document.querySelector("#site-nav");
  if (menu && nav) {
    menu.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      menu.setAttribute("aria-expanded", String(open));
    });
  }

  const matrix = document.querySelector("#matrixDemo");
  if (matrix) {
    const pixels = [];
    for (let i = 0; i < 256; i++) {
      const el = document.createElement("i");
      el.className = "pixel";
      matrix.appendChild(el);
      pixels.push(el);
    }
    let t = 0;
    function draw() {
      t += 0.07;
      pixels.forEach((p, i) => {
        const x = i % 16, y = Math.floor(i / 16);
        const wave = Math.sin((x + t * 8) * .55) + Math.cos((y - t * 5) * .48);
        const ring = Math.sin(Math.hypot(x - 7.5, y - 7.5) * .9 - t * 6);
        const v = (wave + ring + 3) / 6;
        const hue = 12 + Math.round(v * 32);
        const light = 13 + Math.round(v * 43);
        p.style.background = "hsl(" + hue + " 92% " + light + "%)";
        p.style.boxShadow = v > .65 ? "0 0 10px hsla(" + hue + " 100% 60% / .6)" : "none";
      });
      requestAnimationFrame(draw);
    }
    draw();
  }

  const manualSearch = document.querySelector("#manualSearch");
  if (manualSearch) {
    const sections = [...document.querySelectorAll(".manual-section")];
    const noResults = document.querySelector("#manualNoResults");
    manualSearch.addEventListener("input", () => {
      const q = manualSearch.value.trim().toLowerCase();
      let visible = 0;
      sections.forEach(section => {
        const match = !q || section.textContent.toLowerCase().includes(q);
        section.hidden = !match;
        if (match) visible++;
      });
      if (noResults) noResults.hidden = visible !== 0;
    });
  }

  const registrationForm = document.querySelector("#registrationForm");
  if (registrationForm) {
    const status = document.querySelector("#registrationStatus");
    const button = registrationForm.querySelector('button[type="submit"]');

    registrationForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      status.className = "form-status";
      status.textContent = "";

      const email = document.querySelector("#regEmail").value.trim();
      const phone = document.querySelector("#regPhone").value.trim();
      const notifyEmail = document.querySelector("#notifyEmail").checked;
      const notifySms = document.querySelector("#notifySms").checked;
      const consent = document.querySelector("#regConsent").checked;
      const website = document.querySelector("#regWebsite").value;

      if (!email || !phone) {
        status.className = "form-status error";
        status.textContent = "Укажите e-mail и номер телефона.";
        return;
      }
      if (!notifyEmail && !notifySms) {
        status.className = "form-status error";
        status.textContent = "Выберите хотя бы один способ уведомления.";
        return;
      }
      if (!consent) {
        status.className = "form-status error";
        status.textContent = "Подтвердите согласие на хранение контактных данных.";
        return;
      }

      button.disabled = true;
      button.textContent = "Сохранение…";

      try {
        const response = await fetch("/api/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, phone, notifyEmail, notifySms, consent, website })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.ok) {
          throw new Error(data.message || "Не удалось сохранить регистрацию.");
        }

        status.className = "form-status success";
        status.textContent = data.message || "Регистрация сохранена.";
        registrationForm.reset();
        document.querySelector("#notifyEmail").checked = true;
      } catch (error) {
        status.className = "form-status error";
        status.textContent = error.message || "Ошибка регистрации.";
      } finally {
        button.disabled = false;
        button.textContent = "Зарегистрироваться";
      }
    });
  }
})();
(() => {
  "use strict";
  // Private messages are saved as BBCode, never as untrusted HTML.
  const allowedFonts = /^(Arial|Verdana|Georgia|Tahoma|Trebuchet MS|Courier New)$/i;
  const allowedSizes = /^(12|14|16|18|20|24|28|32)$/;
  const allowedHex = /^#[0-9a-f]{6}$/i;
  const escapeHtml = value => String(value == null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const escapeAttr = escapeHtml;

  function safeUrl(value) {
    try {
      const url = new URL(String(value || "").trim().replace(/&amp;/g, "&"));
      if (url.protocol !== "https:" && url.protocol !== "http:") return "";
      return url.href;
    } catch (_) {
      return "";
    }
  }

  function renderMarkup(raw) {
    let html = escapeHtml(raw || "");
    // Apply the same allowlisted BBCode as the forum, with no arbitrary HTML.
    for (let pass = 0; pass < 4; pass++) {
      html = html.replace(/\[quote author=([^\]\n]{1,80})\]([\s\S]*?)\[\/quote\]/gi,
        '<blockquote class="forum-quote"><b>$1 написал(а):</b><div class="forum-quote-content">$2</div></blockquote>');
      html = html.replace(/\[quote\]([\s\S]*?)\[\/quote\]/gi,
        '<blockquote class="forum-quote"><div class="forum-quote-content">$1</div></blockquote>');
      html = html.replace(/\[spoiler=([^\]\n]{1,80})\]([\s\S]*?)\[\/spoiler\]/gi,
        '<details class="forum-spoiler"><summary>$1</summary><div class="forum-spoiler-content">$2</div></details>');
      html = html.replace(/\[spoiler\]([\s\S]*?)\[\/spoiler\]/gi,
        '<details class="forum-spoiler"><summary>Спойлер</summary><div class="forum-spoiler-content">$1</div></details>');
      html = html.replace(/\[b\]([\s\S]*?)\[\/b\]/gi, "<strong>$1</strong>");
      html = html.replace(/\[i\]([\s\S]*?)\[\/i\]/gi, "<em>$1</em>");
      html = html.replace(/\[u\]([\s\S]*?)\[\/u\]/gi, "<u>$1</u>");
      html = html.replace(/\[s\]([\s\S]*?)\[\/s\]/gi, "<s>$1</s>");
      html = html.replace(/\[color=(#[0-9a-f]{6})\]([\s\S]*?)\[\/color\]/gi, '<span style="color:$1">$2</span>');
      html = html.replace(/\[size=(12|14|16|18|20|24|28|32)\]([\s\S]*?)\[\/size\]/gi, '<span style="font-size:$1px">$2</span>');
      html = html.replace(/\[font=(Arial|Verdana|Georgia|Tahoma|Trebuchet MS|Courier New)\]([\s\S]*?)\[\/font\]/gi,
        '<span style="font-family:$1">$2</span>');
    }
    html = html.replace(/\[url=([^\]\s]+)\]([\s\S]*?)\[\/url\]/gi, (_, href, label) => {
      const url = safeUrl(href);
      return url ? '<a class="forum-inline-link" href="' + escapeAttr(url)
        + '" target="_blank" rel="noopener noreferrer">' + label + '</a>' : label;
    });
    html = html.replace(/\[url\]([^\[]+)\[\/url\]/gi, (_, href) => {
      const url = safeUrl(href);
      return url ? '<a class="forum-inline-link" href="' + escapeAttr(url)
        + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(url) + '</a>' : escapeHtml(href);
    });
    // Do not request external images automatically from a private conversation.
    // The recipient may choose to open them, without transmitting the page's referrer.
    html = html.replace(/\[img\]([^\[]+)\[\/img\]/gi, (_, src) => {
      const url = safeUrl(src);
      return url ? '<a class="pm-remote-image forum-inline-link" href="' + escapeAttr(url)
        + '" target="_blank" rel="noopener noreferrer">▣ Открыть изображение</a>' : '';
    });
    return html.replace(/\n/g, "<br>");
  }

  function cssColorToHex(value) {
    const color = String(value || "").trim().toLowerCase();
    if (allowedHex.test(color)) return color;
    const rgb = color.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/);
    if (!rgb) return "";
    const nums = rgb.slice(1).map(v => Math.max(0, Math.min(255, Number(v))));
    return "#" + nums.map(x => x.toString(16).padStart(2, "0")).join("");
  }

  function serializeNode(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const tag = node.tagName.toLowerCase();
    const inside = [...node.childNodes].map(serializeNode).join("");
    if (tag === "br") return "\n";
    if (tag === "b" || tag === "strong") return "[b]" + inside + "[/b]";
    if (tag === "i" || tag === "em") return "[i]" + inside + "[/i]";
    if (tag === "u") return "[u]" + inside + "[/u]";
    if (tag === "s" || tag === "strike" || tag === "del") return "[s]" + inside + "[/s]";
    if (tag === "font") {
      let value = inside;
      const face = String(node.getAttribute("face") || "").trim();
      const color = String(node.getAttribute("color") || "").trim();
      const size = String(node.dataset.pmSize || "").trim();
      if (allowedFonts.test(face)) value = "[font=" + face + "]" + value + "[/font]";
      if (allowedSizes.test(size)) value = "[size=" + size + "]" + value + "[/size]";
      if (allowedHex.test(color)) value = "[color=" + color.toLowerCase() + "]" + value + "[/color]";
      return value;
    }
    if (tag === "span") {
      const style = node.style || {};
      let value = inside;
      const weight = String(style.fontWeight || "").toLowerCase();
      const decoration = String(style.textDecorationLine || style.textDecoration || "").toLowerCase();
      const face = String(style.fontFamily || "").replace(/^["']|["']$/g, "").trim();
      const size = String(style.fontSize || "").trim().match(/^(12|14|16|18|20|24|28|32)px$/);
      if (weight === "bold" || Number(weight) >= 600) value = "[b]" + value + "[/b]";
      if (String(style.fontStyle || "").toLowerCase() === "italic") value = "[i]" + value + "[/i]";
      if (decoration.includes("underline")) value = "[u]" + value + "[/u]";
      if (decoration.includes("line-through")) value = "[s]" + value + "[/s]";
      if (allowedFonts.test(face)) value = "[font=" + face + "]" + value + "[/font]";
      if (size) value = "[size=" + size[1] + "]" + value + "[/size]";
      const color = cssColorToHex(style.color);
      if (color) value = "[color=" + color + "]" + value + "[/color]";
      return value;
    }
    if (tag === "p" || tag === "div") return inside + "\n";
    return inside;
  }

  function createEditor() {
    const editor = document.getElementById("pmText");
    const counter = document.getElementById("pmCounter");
    const preview = document.getElementById("pmPreview");
    const previewBody = document.getElementById("pmPreviewBody");
    const previewToggle = document.getElementById("pmPreviewButton");
    const emoji = document.getElementById("pmEmojiPanel");
    const emojiButton = document.getElementById("pmEmojiButton");
    const font = document.getElementById("pmFont");
    const size = document.getElementById("pmSize");
    const color = document.getElementById("pmColor");
    const tools = [...document.querySelectorAll(".pm-format[data-format]")];
    if (!editor || !counter || !preview || !previewBody) return null;
    const commands = { b: "bold", i: "italic", u: "underline", s: "strikeThrough" };
    let savedRange = null;
    let onChange = () => {};

    function getValue() {
      return [...editor.childNodes].map(serializeNode).join("")
        .replace(/\n{3,}/g, "\n\n").replace(/\n+$/g, "").trim();
    }
    function editorRange() {
      const selection = window.getSelection();
      if (!selection || !selection.rangeCount) return null;
      const range = selection.getRangeAt(0);
      const ancestor = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
      return ancestor && editor.contains(ancestor) ? range : null;
    }
    function saveRange() {
      const range = editorRange();
      if (range) savedRange = range.cloneRange();
    }
    function selectRange() {
      editor.focus();
      if (savedRange) {
        try {
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(savedRange.cloneRange());
          return;
        } catch (_) {}
      }
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
    function updateActive() {
      for (const button of tools) {
        let active = false;
        try { active = !!(editorRange() && document.queryCommandState(commands[button.dataset.format])); }
        catch (_) {}
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
      }
    }
    function update() {
      counter.textContent = getValue().length + " / 3000";
      if (!preview.hidden) renderPreview();
      updateActive();
      onChange(getValue());
    }
    function renderPreview() {
      const value = getValue();
      previewBody.innerHTML = value ? renderMarkup(value) : '<span class="pm-muted">Сообщение пока пустое.</span>';
    }
    function insertText(value) {
      selectRange();
      let range = editorRange();
      if (!range) return;
      range.deleteContents();
      const text = document.createTextNode(value);
      range.insertNode(text);
      const newRange = document.createRange();
      newRange.setStartAfter(text);
      newRange.collapse(true);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(newRange);
      saveRange();
      update();
    }
    function wrapSelection(open, close) {
      selectRange();
      const range = editorRange();
      if (!range) return;
      if (range.collapsed) {
        const text = document.createTextNode(open + close);
        range.insertNode(text);
        const newRange = document.createRange();
        newRange.setStart(text, open.length);
        newRange.collapse(true);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(newRange);
      } else {
        const selected = window.getSelection().toString();
        range.deleteContents();
        const text = document.createTextNode(open + selected + close);
        range.insertNode(text);
        const newRange = document.createRange();
        newRange.setStartAfter(text);
        newRange.collapse(true);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(newRange);
      }
      saveRange();
      update();
    }
    function normalizeFont() {
      editor.querySelectorAll("font").forEach(node => {
        const face = node.getAttribute("face");
        const col = node.getAttribute("color");
        const sz = node.dataset.pmSize;
        if (face) node.style.fontFamily = face;
        if (col) node.style.color = col;
        if (sz) node.style.fontSize = sz + "px";
      });
    }
    function format(command, value) {
      selectRange();
      document.execCommand(command, false, value || null);
      normalizeFont();
      saveRange();
      update();
    }
    tools.forEach(button => {
      button.addEventListener("mousedown", event => event.preventDefault());
      button.addEventListener("click", () => format(commands[button.dataset.format]));
    });
    font?.addEventListener("mousedown", saveRange);
    font?.addEventListener("focus", saveRange);
    font?.addEventListener("change", () => {
      if (allowedFonts.test(font.value)) format("fontName", font.value);
    });
    size?.addEventListener("mousedown", saveRange);
    size?.addEventListener("focus", saveRange);
    size?.addEventListener("change", () => {
      if (!allowedSizes.test(size.value)) return;
      selectRange();
      document.execCommand("fontSize", false, "7");
      editor.querySelectorAll('font[size="7"]').forEach(el => {
        el.removeAttribute("size");
        el.dataset.pmSize = size.value;
        el.style.fontSize = size.value + "px";
      });
      saveRange();
      update();
    });
    color?.addEventListener("mousedown", saveRange);
    color?.addEventListener("focus", saveRange);
    color?.addEventListener("change", () => {
      if (allowedHex.test(color.value)) format("foreColor", color.value);
    });
    emojiButton?.addEventListener("click", event => {
      event.stopPropagation();
      emoji.hidden = !emoji.hidden;
    });
    emoji?.querySelectorAll("button").forEach(button => {
      button.addEventListener("click", () => {
        insertText(button.textContent || "");
        emoji.hidden = true;
      });
    });
    document.addEventListener("click", event => {
      if (!emoji?.hidden && event.target !== emojiButton && !emoji.contains(event.target)) emoji.hidden = true;
    });
    document.getElementById("pmQuoteButton")?.addEventListener("click", () => wrapSelection("[quote]", "[/quote]"));
    document.getElementById("pmSpoilerButton")?.addEventListener("click", () => {
      const title = (prompt("Название спойлера:", "Спойлер") || "Спойлер")
        .replace(/[\]\r\n]/g, " ").slice(0, 80);
      wrapSelection("[spoiler=" + title + "]", "[/spoiler]");
    });
    document.getElementById("pmLinkButton")?.addEventListener("click", () => {
      saveRange();
      const selected = editorRange() ? window.getSelection().toString().trim() : "";
      const url = prompt("Введите ссылку (https:// или http://):", "https://");
      if (!url || !safeUrl(url)) return;
      const label = selected || prompt("Текст ссылки:", "Ссылка") || "Ссылка";
      insertText("[url=" + safeUrl(url) + "]" + label + "[/url]");
    });
    document.getElementById("pmImageButton")?.addEventListener("click", () => {
      saveRange();
      const url = prompt("Введите ссылку на изображение (https:// или http://):", "https://");
      if (!url || !safeUrl(url)) return;
      insertText("[img]" + safeUrl(url) + "[/img]");
    });
    previewToggle?.addEventListener("click", () => {
      preview.hidden = !preview.hidden;
      previewToggle.textContent = preview.hidden ? "Предпросмотр" : "Скрыть предпросмотр";
      if (!preview.hidden) renderPreview();
    });
    editor.addEventListener("input", update);
    editor.addEventListener("click", saveRange);
    editor.addEventListener("keyup", saveRange);
    editor.addEventListener("mouseup", saveRange);
    editor.addEventListener("paste", event => {
      // Pasted HTML is not trusted. Keep plain text only.
      const plain = event.clipboardData?.getData("text/plain");
      if (plain == null) return;
      event.preventDefault();
      insertText(plain);
    });
    document.addEventListener("selectionchange", () => {
      if (editorRange()) { saveRange(); updateActive(); }
    });
    return {
      getValue,
      focus: () => editor.focus(),
      clear() {
        editor.replaceChildren();
        savedRange = null;
        update();
      },
      onChange(handler) { onChange = typeof handler === "function" ? handler : () => {}; },
    };
  }

  window.FieryPrivateEditor = { createEditor, renderMarkup };
})();
#!/usr/bin/env python3
"""Build an isolated, static GitHub Pages preview. Does not deploy to HostiMan."""
from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / ".preview-pages"
BASE = "/FieryLedLamp-Web-Flasher/"
MAIN_LIVE = "https://fieryledlamp.ru"
FLASH_LIVE = "https://firmware.fieryledlamp.ru"
ALLOWED = {".html", ".css", ".js", ".json", ".txt", ".svg", ".png",
           ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".woff", ".woff2"}
ATTRS = re.compile(
    r'(?P<attr>\b(?:href|src|action|poster|data-main-base|data-search-index)=)'
    r'(?P<q>["\x27])(?P<value>.*?)(?P=q)', re.I
)
CSS_ROOT = re.compile(r'url\(\s*(?P<q>["\x27]?)/(?P<path>[^)"\x27]*)'
                      r'(?P=q)\s*\)', re.I)

PREVIEW_JS = r"""(() => {
  "use strict";
  const firmware = location.pathname.startsWith("/FieryLedLamp-Web-Flasher/firmware/");
  const warning = "Предпросмотр GitHub: изменения ещё не опубликованы на HostiMan. " +
    "Серверные функции (PHP, аккаунты, форум, статистика) здесь не работают.";
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const candidate = typeof input === "string" ? input : input.url;
    const url = new URL(candidate, location.href);
    if (url.pathname.endsWith(".php") || url.pathname.includes("/api/")) {
      return Promise.reject(new Error("PHP недоступен в предварительном просмотре."));
    }
    return originalFetch(input, init);
  };
  document.addEventListener("submit", event => {
    if (event.target.closest("form") && !event.target.closest(".fl-search")) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  if (firmware) {
    document.addEventListener("click", event => {
      if (event.target.closest("#selectPortBtn, #flashBtn")) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);
  }
  document.addEventListener("DOMContentLoaded", () => {
    const bar = document.createElement("div");
    bar.setAttribute("role", "status");
    bar.style.cssText = "position:sticky;top:0;z-index:100000;background:#42230e;color:#fff2d3;" +
      "font:600 13px/1.5 system-ui,sans-serif;text-align:center;padding:9px 16px;" +
      "box-shadow:0 2px 8px #0006";
    bar.textContent = warning + (firmware ? " Подключение к COM-порту и прошивка отключены." : "");
    document.body.prepend(bar);
    if (firmware) {
      for (const id of ["selectPortBtn", "flashBtn", "saveSettings", "eraseAll"]) {
        const element = document.getElementById(id);
        if (element) {
          element.disabled = true;
          element.title = "Отключено в предварительном просмотре";
        }
      }
    }
  });
})();"""


def local_url(url: str) -> str:
    for origin, prefix in ((FLASH_LIVE, BASE + "firmware/"), (MAIN_LIVE, BASE)):
        if url == origin or url == origin + "/":
            return prefix
        if url.startswith(origin + "/"):
            return prefix + url[len(origin) + 1:]
    if url.startswith("/") and not url.startswith("//"):
        return BASE + url.lstrip("/")
    return url


def rewrite_html(source: str) -> str:
    def rewrite_attr(m: re.Match[str]) -> str:
        return m.group("attr") + m.group("q") + local_url(m.group("value")) + m.group("q")

    source = ATTRS.sub(rewrite_attr, source)
    source = re.sub(r'data-auth="(?:local|remote)"', 'data-auth="preview"', source)
    injected = ('  <meta name="robots" content="noindex,nofollow,noarchive">\n'
                '  <script src="' + BASE + 'preview.js" defer></script>\n')
    source, count = re.subn(r'(?i)<head>', '<head>\n' + injected, source, count=1)
    if count != 1:
        raise ValueError("HTML page is missing <head>")
    return source


def rewrite_css(source: str) -> str:
    return CSS_ROOT.sub(
        lambda m: "url(" + m.group("q") + BASE + m.group("path") + m.group("q") + ")",
        source,
    )


def rewrite_js(source: str, rel: Path) -> str:
    if rel.as_posix() == "site.js":
        source = source.replace('const TRACK_URL = "/api/index.php?action=track";',
                                "const TRACK_URL = null;")
        source = source.replace('function track(event, item = "", path = location.pathname) {',
                                'function track(event, item = "", path = location.pathname) {\n'
                                '    if (!TRACK_URL) return;')
    elif rel.as_posix() == "scripts/versions.js":
        source = source.replace('const SOURCE = "/Version.txt";',
                                'const SOURCE = "' + BASE + 'Version.txt";')
    return source


def copy_site(source_dir: Path, target_dir: Path) -> None:
    for item in source_dir.rglob("*"):
        if not item.is_file() or item.suffix.lower() not in ALLOWED:
            continue
        relative = item.relative_to(source_dir)
        if "api" in relative.parts or "archives" in relative.parts:
            continue
        destination = target_dir / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        if item.suffix.lower() not in {".html", ".css", ".js"}:
            shutil.copy2(item, destination)
            continue
        value = item.read_text(encoding="utf-8")
        if item.suffix.lower() == ".html":
            value = rewrite_html(value)
        elif item.suffix.lower() == ".css":
            value = rewrite_css(value)
        elif source_dir.name == "public":
            value = rewrite_js(value, relative)
        destination.write_text(value, encoding="utf-8")


def create_release_index() -> None:
    versions = []
    releases_dir = ROOT / "firmware/update"
    for directory in releases_dir.iterdir():
        if not directory.is_dir() or not re.fullmatch(r"v?\d+(?:\.\d+){0,3}", directory.name):
            continue
        manifest = directory / "manifest.json"
        if not manifest.is_file():
            manifest = releases_dir / "manifest.json"
        if not (directory / "update.zip").is_file() or not manifest.is_file():
            continue
        details = json.loads(manifest.read_text(encoding="utf-8"))
        if details.get("ready") is False or not isinstance(details.get("files"), list) or not details["files"]:
            continue
        version = directory.name.lstrip("vV")
        versions.append({
            "version": version,
            "label": "Версия " + version,
            "manifestUrl": "./update/" + directory.name + "/manifest.json",
            "firmwareZipUrl": "./update/" + directory.name + "/update.zip",
        })
    versions.sort(key=lambda v: tuple(int(n) for n in v["version"].split(".")), reverse=True)
    (OUT / "firmware/update/versions-preview.json").write_text(
        json.dumps({"versions": versions, "otaVersions": [v["version"] for v in versions]},
                   ensure_ascii=False, indent=2), encoding="utf-8",
    )
    config = OUT / "firmware/config.js"
    content = config.read_text(encoding="utf-8")
    assert 'versionsUrl: "./update/versions.php"' in content
    config.write_text(content.replace('versionsUrl: "./update/versions.php"',
                                      'versionsUrl: "./update/versions-preview.json"'),
                      encoding="utf-8")


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()
    copy_site(ROOT / "website/public", OUT)
    copy_site(ROOT / "firmware", OUT / "firmware")
    shutil.copy2(ROOT / "firmware/Version.txt", OUT / "Version.txt")
    create_release_index()
    (OUT / ".nojekyll").write_text("", encoding="utf-8")
    (OUT / "robots.txt").write_text("User-agent: *\nDisallow: /\n", encoding="utf-8")
    (OUT / "preview.js").write_text(PREVIEW_JS, encoding="utf-8")
    # Ensure all required entry points are present.
    for page in ("index.html", "instruction.html", "versions.html", "firmware/index.html",
                 "firmware/update/versions-preview.json"):
        assert (OUT / page).is_file(), page
    print("Prepared GitHub Pages preview (static only):", OUT)


if __name__ == "__main__":
    main()

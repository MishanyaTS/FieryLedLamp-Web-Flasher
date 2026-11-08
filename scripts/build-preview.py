#!/usr/bin/env python3
"""Build a safe, static GitHub Pages preview for both Fiery Led Lamp sites.

Production FTP, PHP backends, downloads and firmware archives are never copied.
The preview URL is a GitHub Pages project path (/<repository>/).
"""
from __future__ import annotations

import json
import os
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPO_NAME = os.environ.get("GITHUB_REPOSITORY", "MishanyaTS/FieryLedLamp-Web-Flasher").split("/")[-1]
BASE = "/" + REPO_NAME + "/"
OUTPUT = ROOT / ".preview-output"

SKIP_DIRS = {"api", "update", "fieryledlamp-private", "__pycache__", ".git"}
SKIP_EXT = {".php", ".exe", ".ipa", ".zip", ".bin", ".pem", ".key", ".sql", ".gz"}

NOTICE = """
<aside class="preview-notice" role="status">
  <strong>ПРЕДПРОСМОТР</strong> — тестовый сайт. Никакие изменения на Hostiman
  не опубликованы. Аккаунты, форум, сообщения, статистика, загрузки и прошивка
  устройств здесь не работают.
</aside>
"""

PREVIEW_STYLE = """
.preview-notice{box-sizing:border-box;padding:11px 18px;text-align:center;
 background:#292014;color:#ffdaa1;border-bottom:1px solid #865528;
 font:600 12px/1.5 system-ui,Arial,sans-serif}
.preview-notice strong{color:#ffc15b;letter-spacing:.08em}
"""

def ignored(_folder: str, names: list[str]) -> set[str]:
    result = set()
    for name in names:
        if name in SKIP_DIRS or Path(name).suffix.lower() in SKIP_EXT:
            result.add(name)
    return result


def redirect_links(text: str) -> str:
    # Leave all navigation inside the isolated preview, not on the live domains.
    text = re.sub(r"https://firmware\.fieryledlamp\.ru/?", BASE + "firmware/", text)
    text = re.sub(r"https://(?:www\.)?fieryledlamp\.ru/?", BASE, text)
    # HTML attribute URLs: /assets -> /REPO/assets (not //external).
    text = re.sub(
        r'((?:href|src|action|poster|data-main-base|data-search-index)=["\'])/(?!/|' +
        re.escape(REPO_NAME) + r'/)',
        lambda m: m.group(1) + BASE,
        text,
        flags=re.I,
    )
    return text


def process_html(path: Path) -> None:
    html = redirect_links(path.read_text(encoding="utf-8"))
    # No privileged account endpoints should run from the public static preview.
    if path.is_relative_to(OUTPUT / "firmware"):
        html = html.replace('data-auth="remote"', 'data-auth="off"')
    if "</head>" in html:
        html = html.replace(
            "</head>",
            f'<meta name="robots" content="noindex,nofollow">'
            f'<link rel="stylesheet" href="{BASE}preview.css">\n</head>', 1
        )
    if "<main" in html:
        html = re.sub(r"(?=<main\b)", NOTICE + "\n", html, count=1)
    path.write_text(html, encoding="utf-8")


def process_js(path: Path) -> None:
    js = path.read_text(encoding="utf-8")
    # Static history reads the release text from the preview copy.
    js = js.replace('const SOURCE = "/Version.txt";', f'const SOURCE = "{BASE}Version.txt";')
    if path.name == "header.js":
        # In the Pages project preview, HTML lives under BASE, not at domain /.
        js = re.sub(
            r'(const staticPages = new Set\(\[)(.*?)(\]\);)',
            lambda m: m.group(1) + re.sub(
                r'"(/[^"]*)"',
                lambda n: '"' + BASE.rstrip("/") + n.group(1) + '"',
                m.group(2)
            ) + m.group(3),
            js,
            flags=re.S
        )
        for name in ("site.js", "header.js"):
            js = js.replace(
                f'scriptUrl.pathname === "/{name}"',
                f'scriptUrl.pathname === "{BASE}{name}"',
            )
    path.write_text(js, encoding="utf-8")


def build() -> None:
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    shutil.copytree(ROOT / "website/public", OUTPUT, ignore=ignored)
    shutil.copytree(ROOT / "firmware", OUTPUT / "firmware", ignore=ignored)
    (OUTPUT / "preview.css").write_text(PREVIEW_STYLE.strip() + "\n", encoding="utf-8")
    (OUTPUT / ".nojekyll").write_text("", encoding="utf-8")

    for page in OUTPUT.rglob("*.html"):
        process_html(page)
    for script in OUTPUT.rglob("*.js"):
        process_js(script)
    # Header search results must point at the preview, not live or root github.io.
    for index in OUTPUT.rglob("header-search.json"):
        data = json.loads(index.read_text(encoding="utf-8"))
        for page in data.get("pages", []):
            link = page.get("href", "")
            if isinstance(link, str) and link.startswith("/") and not link.startswith("//"):
                page["href"] = BASE + link.lstrip("/")
        index.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")

    main = OUTPUT / "index.html"
    flasher = OUTPUT / "firmware/index.html"
    assert main.is_file() and flasher.is_file(), "Missing preview entry pages"
    assert (OUTPUT / "Version.txt").is_file(), "Missing release history"
    assert "ПРЕДПРОСМОТР" in main.read_text(encoding="utf-8")
    assert "ПРЕДПРОСМОТР" in flasher.read_text(encoding="utf-8")
    assert not (OUTPUT / "api").exists(), "Private PHP API must never be in preview"
    assert not (OUTPUT / "firmware/update").exists(), "OTA downloads must not enter preview"
    print(f"Static preview ready: {OUTPUT} (base {BASE})")
    print(f"Website: {BASE} | Web Flasher: {BASE}firmware/")
    print("Note: Server/PHP functionality and real firmware flashing are disabled.")

if __name__ == "__main__":
    build()

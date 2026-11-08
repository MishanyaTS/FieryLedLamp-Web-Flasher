#!/usr/bin/env python3
"""Render the shared header for both static sites. No third-party dependencies."""

import argparse
import hashlib
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'website/shared/header'
START = '<!-- SHARED_HEADER:START -->'
END = '<!-- SHARED_HEADER:END -->'
HEADER = re.compile(r'<!-- SHARED_HEADER:START -->.*?<!-- SHARED_HEADER:END -->|<header class="(?:fl-header|site-header)".*?</header>', re.S)
# Footer brand is intentionally absent on both sites. Keep the description and links.
FOOTER = re.compile(r'<footer\b[^>]*>.*?</footer>', re.S | re.I)
FOOTER_BRAND = re.compile(
    r'<a class="brand" href="[^"]*">\s*<span class="brand-mark">.*?</span>\s*'
    r'<span>Fiery Led Lamp</span>\s*</a>', re.S
)
PAGE_KEYS = {
    '/': 'home', '/instruction.html': 'instruction', '/setup.html': 'setup',
    '/hardware.html': 'setup', '/mqtt-broker.html': 'mqtt', '/mqtt-commands.html': 'mqtt',
    '/mqtt-wqtt.html': 'broker', '/mqtt-smart-home.html': 'smart-home',
    '/fiery-lamp-control.html': 'control', '/versions.html': 'versions', '/forum.html': 'forum',
}
DIRECT_KEYS = {key: value for key, value in PAGE_KEYS.items() if key not in ('/hardware.html', '/mqtt-commands.html')}


def render(template, symbols, page, firmware, version):
    active = 'flasher' if firmware else PAGE_KEYS.get(page)
    current = 'flasher' if firmware else DIRECT_KEYS.get(page)
    values = {
        'MAIN_BASE': 'https://fieryledlamp.ru/' if firmware else '/',
        'ASSET_BASE': './' if firmware else '/',
        'AUTH_MODE': 'off' if firmware else 'local',
        'VERSION': version, 'SYMBOLS': symbols,
    }

    def token(match):
        key = match.group(1)
        if key.startswith('NAV:'):
            name = key[4:]
            return 'class="fl-nav-link' + (' is-active' if name == active else '') + '"' + (' aria-current="page"' if name == current else '')
        if key.startswith('CURRENT:'):
            return ' aria-current="page"' if not firmware and page == key[8:] else ''
        if key not in values:
            raise ValueError(f'Unknown header token: {key}')
        return values[key]

    return START + '\n' + re.sub(r'\{\{([^{}]+)\}\}', token, template).strip() + '\n' + END


def build(check=False):
    sources = {name: (SOURCE / name).read_text() for name in ('template.html', 'header.css', 'header.js', 'icons.svg')}
    fingerprint = '\0'.join(sources.values()) + Path(__file__).read_text()
    version = 'shared-' + hashlib.sha256(fingerprint.encode()).hexdigest()[:12]
    # Local references eliminate external sprite cache/deployment races.
    symbols = sources['icons.svg'].strip()
    symbols = symbols.replace('<svg xmlns="http://www.w3.org/2000/svg">', '<svg class="fl-symbols" xmlns="http://www.w3.org/2000/svg" width="0" height="0" aria-hidden="true" focusable="false">', 1)
    symbols = re.sub(r'id="([^"]+)"', r'id="fl-header-\1"', symbols)
    symbols = re.sub(r'url\(#([^)]+)\)', r'url(#fl-header-\1)', symbols)
    ui_css = (SOURCE.parent / 'page-ui.css').read_text()
    outputs = {ROOT / 'website/public/page-ui.css': ui_css, ROOT / 'firmware/page-ui.css': ui_css}
    page_count = 0
    for folder, firmware in ((ROOT / 'website/public', False), (ROOT / 'firmware', True)):
        candidates = [folder / 'index.html'] if firmware else sorted(folder.glob('*.html'))
        for path in candidates:
            original = path.read_text()
            if not HEADER.search(original) and not re.search(r'<main\b', original):
                continue  # Redirect-only documents have no visible site shell.
            page = '/' if path.name == 'index.html' else '/' + path.name
            block = render(sources['template.html'], symbols, page, firmware, version)
            if HEADER.search(original):
                content, count = HEADER.subn(lambda _: block, original)
                if count != 1:
                    raise ValueError(f'Expected one site header: {path}')
            else:
                content, count = re.subn(r'(<body\b[^>]*>)', lambda m: m.group() + '\n' + block, original, count=1)
                if not count:
                    raise ValueError(f'Missing body: {path}')
            # Remove only the icon and project-name link in the footer.
            # Do not touch the shared top header or text in the page body.
            content = FOOTER.sub(lambda match: FOOTER_BRAND.sub('', match.group()), content)
            asset_base = './' if firmware else '/'
            for name, pattern, include in (
                ('page-ui.css', r'href="(?:\./|/)page-ui\.css(?:\?[^\"]*)?"', f'<link rel="stylesheet" href="{asset_base}page-ui.css">'),
                ('header.css', r'href="(?:\./|/)header\.css(?:\?[^\"]*)?"', f'<link rel="stylesheet" href="{asset_base}header.css?v={version}">'),
                ('header.js', r'src="(?:\./|/)header\.js(?:\?[^\"]*)?"', f'<script src="{asset_base}header.js?v={version}" defer></script>'),
            ):
                if re.search(pattern, content):
                    attr = 'href' if name.endswith('.css') else 'src'
                    suffix = '' if name == 'page-ui.css' else f'?v={version}'
                    content = re.sub(pattern, f'{attr}="{asset_base}{name}{suffix}"', content)
                else:
                    content = content.replace('</head>', '  ' + include + '\n</head>', 1)
            outputs[path] = content
            page_count += 1
        for name in ('header.css', 'header.js'):
            outputs[folder / name] = sources[name]
    outputs[ROOT / 'firmware/header-search.json'] = (ROOT / 'website/public/header-search.json').read_text()
    # Use one content version per asset on every page. Previously site.js had
    # different query strings on login/forum/account pages, defeating reuse.
    hashes = {}
    asset_pattern = re.compile(r'((?:href|src)=")(?P<base>/|\./)(?P<name>[^"?#]+\.(?:css|js))(?:\?[^"#]*)?(")')
    for path, content in list(outputs.items()):
        if path.suffix != '.html':
            continue
        folder = ROOT / ('firmware' if path.is_relative_to(ROOT / 'firmware') else 'website/public')
        def stamp_asset(match):
            name = match.group('name')
            if name in ('header.css', 'header.js'):
                return match.group()
            asset = folder / name
            if asset not in outputs and not asset.is_file():
                return match.group()
            if asset not in hashes:
                data = outputs[asset].encode() if asset in outputs else asset.read_bytes()
                hashes[asset] = hashlib.sha256(data).hexdigest()[:12]
            return match.group(1) + match.group('base') + name + '?v=' + hashes[asset] + '"'
        outputs[path] = asset_pattern.sub(stamp_asset, content)
    changed = [path for path, content in outputs.items() if not path.exists() or path.read_text() != content]
    if check and changed:
        raise SystemExit('Shared header is out of date: ' + ', '.join(str(p.relative_to(ROOT)) for p in changed))
    if not check:
        for path in changed:
            path.write_text(outputs[path])
    print(f'Shared header: {page_count} pages, {len(changed)} files updated, version {version}' + (' (check)' if check else ''))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Fail if generated headers/resources are stale; do not write files.')
    build(parser.parse_args().check)

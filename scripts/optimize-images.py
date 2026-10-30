#!/usr/bin/env python3
"""Prepare a lossless WebP diagram for publication, keeping the original PNG."""

import argparse
import hashlib
import json
import re
from pathlib import Path
from PIL import Image


def optimize(root):
    public = root / 'website/public'
    source = public / 'images/fieryledlamp-connection.png'
    target = source.with_suffix('.webp')
    page = public / 'hardware.html'
    source_image = Image.open(source)
    original = source_image.convert('RGBA')
    original.save(target, 'WEBP', lossless=True, exact=True, method=6, icc_profile=source_image.info.get('icc_profile', b''))
    if Image.open(target).convert('RGBA').tobytes() != original.tobytes():
        raise RuntimeError('Lossless image verification failed')
    content = page.read_text()
    old_picture = re.search(r'<picture data-optimized-scheme>.*?</picture>', content, re.S)
    image = re.search(r'<img\b[^>]*src="/images/fieryledlamp-connection.png"[^>]*>', old_picture.group() if old_picture else content)
    if not image:
        raise RuntimeError('Connection diagram was not found in hardware.html')
    image_tag = re.sub(r'\s+(?:width|height|decoding)="[^"]*"', '', image.group())
    image_tag = image_tag[:-1] + f' width="{original.width}" height="{original.height}" decoding="async">'
    use_webp = target.stat().st_size < source.stat().st_size
    if use_webp:
        version = hashlib.sha256(target.read_bytes()).hexdigest()[:12]
        replacement = '<picture data-optimized-scheme><source srcset="/images/fieryledlamp-connection.webp?v=' + version + '" type="image/webp">' + image_tag + '</picture>'
    else:
        replacement = image_tag
        target.unlink()
    old = old_picture.group() if old_picture else image.group()
    page.write_text(content.replace(old, replacement, 1))
    print(json.dumps({'diagram_png_bytes': source.stat().st_size, 'diagram_webp_bytes': target.stat().st_size if use_webp else None, 'pixels_identical': True, 'webp_used': use_webp}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parent.parent)
    optimize(parser.parse_args().root)

"""Responsive image pipeline for the newsletter site.

Usage (from the website folder):
    python tools/build_images.py            # generate variants + rewrite <img> tags in the HTML pages
    python tools/build_images.py --images   # only (re)generate image variants

1. For every JPG/PNG in images/, writes AVIF + WebP variants to images/opt/
   at 480/800/1200/1600 px wide (never upscaled), plus images/opt/manifest.json.
2. In each HTML page, every <img src="images/NAME.ext" ...> that is NOT already
   inside a <picture> is wrapped as:
       <picture><source type="image/avif" srcset=…><source type="image/webp" srcset=…><img …></picture>
   with width/height from the source file. Attributes on the <img> control it:
       data-sizes="…"     the `sizes` value (default: 100vw)
       data-priority      hero/LCP image: fetchpriority=high, no lazy-loading
       data-keep          leave this <img> alone
   Re-running is safe: images already inside <picture> are skipped.
"""
import json
import os
import re
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG_DIR = os.path.join(ROOT, 'images')
OUT_DIR = os.path.join(IMG_DIR, 'opt')
PAGES = ['index.html', 'dashboard.html', 'accessibility.html', 'privacy.html']
WIDTHS = [480, 800, 1200, 1600]
# Graphics that contain small text need higher quality to stay crisp.
TEXT_HEAVY = {'ai-certificate', 'health-poster', 'values-strip', 'ai-banner',
              'poem1-title', 'poem1-col1', 'poem1-col2', 'poem2'}


def build_variants():
    os.makedirs(OUT_DIR, exist_ok=True)
    manifest = {}
    for name in sorted(os.listdir(IMG_DIR)):
        base, ext = os.path.splitext(name)
        if ext.lower() not in ('.jpg', '.jpeg', '.png'):
            continue
        src = Image.open(os.path.join(IMG_DIR, name))
        alpha = src.mode in ('RGBA', 'LA') or (src.mode == 'P' and 'transparency' in src.info)
        src = src.convert('RGBA' if alpha else 'RGB')
        text = base in TEXT_HEAVY
        q_avif, q_webp = (70, 86) if text else (52, 74)
        variants = []
        for w in WIDTHS:
            tw = min(w, src.width)
            th = round(src.height * tw / src.width)
            im = src if tw == src.width else src.resize((tw, th), Image.LANCZOS)
            for fmt, q in (('avif', q_avif), ('webp', q_webp)):
                path = os.path.join(OUT_DIR, f'{base}-{tw}.{fmt}')
                if fmt == 'avif':
                    im.save(path, 'AVIF', quality=q, speed=4)
                else:
                    im.save(path, 'WEBP', quality=q, method=6)
            variants.append(tw)
            if w >= src.width:
                break
        manifest[name] = {'w': src.width, 'h': src.height, 'variants': variants}
    with open(os.path.join(OUT_DIR, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=1)
    return manifest


IMG_RE = re.compile(r'<img\b[^>]*?\bsrc="images/([^"/]+\.(?:jpe?g|png))"[^>]*>', re.I)


def attr(tag, name):
    m = re.search(r'\b' + re.escape(name) + r'(?:="([^"]*)")?(?=[\s>/])', tag)
    if not m:
        return None
    return m.group(1) if m.group(1) is not None else ''


def drop_attr(tag, name):
    return re.sub(r'\s+' + re.escape(name) + r'(?:="[^"]*")?(?=[\s>/])', '', tag)


def rewrite_pages(manifest):
    for page in PAGES:
        path = os.path.join(ROOT, page)
        if not os.path.exists(path):
            continue
        html = open(path, encoding='utf-8').read()
        out, pos, count = [], 0, 0
        for m in IMG_RE.finditer(html):
            tag, name = m.group(0), m.group(1)
            before = html[:m.start()]
            inside_picture = before.rfind('<picture') > before.rfind('</picture>')
            if inside_picture or attr(tag, 'data-keep') is not None or name not in manifest:
                continue
            info = manifest[name]
            base = os.path.splitext(name)[0]
            sizes = attr(tag, 'data-sizes') or '100vw'
            priority = attr(tag, 'data-priority') is not None
            srcset = lambda fmt: ', '.join(f'images/opt/{base}-{w}.{fmt} {w}w' for w in info['variants'])
            new = drop_attr(drop_attr(tag, 'data-sizes'), 'data-priority')
            for a in ('width', 'height', 'loading', 'decoding', 'fetchpriority'):
                new = drop_attr(new, a)
            extra = f' width="{info["w"]}" height="{info["h"]}"'
            extra += ' fetchpriority="high"' if priority else ' loading="lazy" decoding="async"'
            new = re.sub(r'\s*/?>$', extra + '>', new)
            picture = (f'<picture><source type="image/avif" srcset="{srcset("avif")}" sizes="{sizes}">'
                       f'<source type="image/webp" srcset="{srcset("webp")}" sizes="{sizes}">{new}</picture>')
            out.append(html[pos:m.start()])
            out.append(picture)
            pos = m.end()
            count += 1
        out.append(html[pos:])
        html = ''.join(out)

        # Lightbox links: point a.zoom hrefs at the largest optimized WebP instead of the original file.
        def zoom_href(m):
            tag = m.group(0)
            if 'zoom' not in (attr(tag, 'class') or '').split():
                return tag
            href = attr(tag, 'href') or ''
            name = href[len('images/'):]
            if not href.startswith('images/') or '/' in name or name not in manifest:
                return tag
            biggest = manifest[name]['variants'][-1]
            new_href = f'images/opt/{os.path.splitext(name)[0]}-{biggest}.webp'
            return tag.replace(f'href="{href}"', f'href="{new_href}"')
        html = re.sub(r'<a\b[^>]*>', zoom_href, html)
        if count or html != open(path, encoding='utf-8').read():
            with open(path, 'w', encoding='utf-8', newline='\n') as f:
                f.write(html)
        print(f'{page}: {count} <img> tags converted')


if __name__ == '__main__':
    manifest = build_variants()
    total = sum(os.path.getsize(os.path.join(OUT_DIR, f)) for f in os.listdir(OUT_DIR))
    print(f'{len(manifest)} source images -> images/opt ({total // 1024} KB across all variants)')
    if '--images' not in sys.argv:
        rewrite_pages(manifest)

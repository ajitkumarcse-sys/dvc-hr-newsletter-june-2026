"""Add/refresh ?v=<content hash> on local CSS/JS links in the HTML pages.

The host caches static files for 7 days, so after editing css/style.css or any js/*.js file run:
    python tools/fingerprint_assets.py
Browsers then fetch the new files immediately; unchanged files keep their old version string.
"""
import hashlib
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = ['index.html', 'dashboard.html', 'accessibility.html', 'privacy.html']


def version(rel):
    with open(os.path.join(ROOT, rel), 'rb') as f:
        return hashlib.sha1(f.read()).hexdigest()[:10]


for page in PAGES:
    path = os.path.join(ROOT, page)
    if not os.path.exists(path):
        continue
    html = open(path, encoding='utf-8').read()
    new = re.sub(r'((?:href|src)=")((?:css|js)/[\w.-]+\.(?:css|js))(?:\?v=\w+)?(")',
                 lambda m: f'{m.group(1)}{m.group(2)}?v={version(m.group(2))}{m.group(3)}', html)
    if new != html:
        with open(path, 'w', encoding='utf-8', newline='\n') as f:
            f.write(new)
        print('updated', page)
    else:
        print('unchanged', page)

"""Code-only assets shared by local exports and Firebase CI builds (stdlib only)."""
import hashlib
import json
from pathlib import Path
import shutil

ASSETS = (
    'web/styles.css', 'web/app.js', 'web/dates.js',
    'web/card-layout.js', 'web/viewer-storage.js', 'web/editor-storage.js',
    'web/editor.js', 'web/family-auth.js', 'web/family-users.json',
    'web/vendor/jszip.min.js', 'web/vendor/jszip-LICENSE.md', 'web/vendor/viz-global.js', 'web/vendor/viz-README.md',
    'web/vendor/pdf-lib.min.js', 'web/vendor/pdf-lib-LICENSE.md',
)
DATA_FILE = 'web/family-data.js'
MANIFEST = 'hosting-data.json'


def prepare_viewer(root, site):
    root, site = Path(root), Path(site)
    (site / 'web').mkdir(parents=True, exist_ok=True)
    html = (root / 'index.html').read_text()
    html = html.replace('<html lang="pl">', '<html lang="pl" data-family-prototype="true">')
    html = html.replace('  <script defer src="web/data-loader.js"></script>',
                        '  <script defer src="web/family-data.js"></script>')
    (site / 'index.html').write_text(html)
    for asset in ASSETS:
        destination = site / asset
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(root / asset, destination)


def write_manifest(site, photos):
    site = Path(site)
    manifest = {'version': 1, 'files': {
        name: hashlib.sha256((site / name).read_bytes()).hexdigest()
        for name in sorted({DATA_FILE, *photos})
    }}
    (site / MANIFEST).write_text(json.dumps(manifest, indent=2) + '\n')

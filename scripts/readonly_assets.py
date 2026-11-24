"""Code-only assets shared by local exports and Firebase CI builds (stdlib only)."""
import hashlib
import json
from pathlib import Path
import shutil

ASSETS = (
    'web/styles.css', 'web/app.js', 'web/dates.js',
    'web/card-layout.js', 'web/viewer-storage.js',
    'web/vendor/pdf-lib.min.js', 'web/vendor/pdf-lib-LICENSE.md',
)
DATA_FILE = 'web/family-data.js'
MANIFEST = 'hosting-data.json'


def prepare_viewer(root, site):
    root, site = Path(root), Path(site)
    (site / 'web').mkdir(parents=True, exist_ok=True)
    html = (root / 'index.html').read_text()
    for asset in ('web/data-loader.js', 'web/editor.js',
                  'web/vendor/jszip.min.js', 'web/vendor/viz-global.js'):
        html = html.replace(f'  <script defer src="{asset}"></script>\n', '')
    html = html.replace('web/editor-storage.js', 'web/viewer-storage.js')
    html = html.replace('  <script defer src="web/viewer-storage.js">',
                        '  <script defer src="web/family-data.js"></script>\n'
                        '  <script defer src="web/viewer-storage.js">')
    html = html.replace('<button id="edit-person" type="button">Edit</button>', '')
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

"""Code-only assets shared by local exports and Firebase CI builds (stdlib only)."""
import hashlib
import json
from pathlib import Path
from tree_json import JSON_FILES
import shutil

ASSETS = (
    'web/styles.css', 'web/responsive.css', 'web/viewer-shell.css', 'web/branch-colors.css', 'web/branch-colors.js', 'web/family-fields.js', 'web/app.js', 'web/dates.js', 'web/data-loader.js',
    'web/responsive.js', 'web/generation-scale.js', 'web/generation-scale.css', 'web/i18n.js', 'web/locale-bundle.js', 'locales/pl.json', 'locales/ru.json', 'locales/en.json',
    'web/line-routing.js', 'web/family-layout.js', 'web/card-metrics.js', 'web/card-view.js', 'web/card-layout.js', 'web/viewer-storage.js', 'web/editor-storage.js',
    'web/editor.js', 'web/family-auth.js', 'web/family-users.json',
    'web/vendor/jszip.min.js', 'web/vendor/jszip-LICENSE.md',
    'web/vendor/pdf-lib.min.js', 'web/vendor/pdf-lib-LICENSE.md',
)
DATA_FILE = 'web/family-data.js'
MANIFEST = 'hosting-data.json'


def prepare_viewer(root, site):
    root, site = Path(root), Path(site)
    (site / 'web').mkdir(parents=True, exist_ok=True)
    html = (root / 'index.html').read_text()
    html = html.replace('<html lang="pl">', '<html lang="pl" data-family-prototype="true">')
    (site / 'index.html').write_text(html)
    for asset in ASSETS:
        destination = site / asset
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(root / asset, destination)


def write_manifest(site, photos):
    site = Path(site)
    manifest = {'version': 2, 'files': {
        name: hashlib.sha256((site / name).read_bytes()).hexdigest()
        for name in sorted({DATA_FILE, *JSON_FILES, *photos})
    }}
    (site / MANIFEST).write_text(json.dumps(manifest, indent=2) + '\n')

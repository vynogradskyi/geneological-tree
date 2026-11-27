"""Build and serve the published viewer with synthetic data only.

The site is assembled exactly like the Firebase build (scripts/readonly_assets.prepare_viewer)
but its data comes from tests/fixtures/e2e and its family account is a synthetic test user.
Real family records, photos and accounts are never read.

    python3 tests/e2e_site.py            # build into a temp folder and serve on http://127.0.0.1:8765
"""
import base64
import contextlib
import functools
import hashlib
import http.server
import json
import os
from pathlib import Path
import shutil
import socketserver
import sys
import tempfile
import threading

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / 'tests/fixtures/e2e'
sys.path.insert(0, str(ROOT / 'scripts'))

TEST_LOGIN = 'tester'
TEST_PASSWORD = 'synthetic-qa-password'


def synthetic_user(login=TEST_LOGIN, password=TEST_PASSWORD, iterations=1000):
    salt = b'synthetic-qa-salt'
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, iterations, 32)
    return {'login': login, 'firstName': 'Test', 'lastName': 'Rodzina', 'algorithm': 'PBKDF2-SHA256',
            'iterations': iterations, 'salt': base64.b64encode(salt).decode(),
            'passwordHash': base64.b64encode(digest).decode()}


def build_site(target):
    """Create a published-like site in `target` from the synthetic fixture."""
    from PIL import Image
    from readonly_assets import prepare_viewer
    from build_html import build_payload, write_payload
    target = Path(target)
    with tempfile.TemporaryDirectory(prefix='e2e-data-') as temp:
        data_root = Path(temp)
        for name in ('family-tree.json', 'family-tree-review.json', 'family-translations.json'):
            shutil.copyfile(FIXTURE / name, data_root / name)
        data = json.loads((data_root / 'family-tree.json').read_text())
        (data_root / 'photos').mkdir()
        for person in data['people']:
            if person['photo']:
                # Plain two-tone synthetic portrait (3:4), generated on the fly.
                image = Image.new('RGB', (300, 400), '#6e8a74')
                image.paste('#d9c9a3', (60, 60, 240, 300))
                image.save(data_root / person['photo'])
        payload = build_payload(root=data_root)
        prepare_viewer(ROOT, target)
        write_payload(target, payload)
        shutil.copytree(data_root / 'photos', target / 'photos', dirs_exist_ok=True)
    (target / 'web/family-users.json').write_text(json.dumps({'version': 1, 'users': [synthetic_user()]}, indent=2))
    return data


class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


@contextlib.contextmanager
def serve(directory, port=0):
    handler = functools.partial(_Quiet, directory=str(directory))
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(('127.0.0.1', port), handler) as server:
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield f'http://127.0.0.1:{server.server_address[1]}/'
        finally:
            server.shutdown()


if __name__ == '__main__':
    with tempfile.TemporaryDirectory(prefix='e2e-site-') as site:
        build_site(site)
        with serve(site, int(os.environ.get('PORT', 8765))) as url:
            print(f'Синтетический сайт: {url}  (логин {TEST_LOGIN} / {TEST_PASSWORD}). Ctrl+C — остановить.')
            try:
                threading.Event().wait()
            except KeyboardInterrupt:
                pass

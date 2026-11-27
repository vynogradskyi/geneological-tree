"""Build and serve the published viewer with synthetic data only.

The site is assembled exactly like the Firebase build (scripts/readonly_assets.prepare_viewer)
but its data comes from tests/fixtures/e2e/Data. Real family records and photos are never read.

    python3 tests/e2e_site.py            # build into a temp folder and serve on http://127.0.0.1:8765
"""
import contextlib
import functools
import http.server
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


def build_site(target):
    """Create a published-like site in `target` from the synthetic fixture."""
    from PIL import Image
    import family_store
    from readonly_assets import prepare_viewer
    from build_html import build_payload, write_payload
    target = Path(target)
    with tempfile.TemporaryDirectory(prefix='e2e-data-') as temp:
        data_root = Path(temp)
        shutil.copytree(FIXTURE / family_store.DATA, data_root / family_store.DATA)
        shutil.copyfile(family_store.schema_path(ROOT), family_store.schema_path(data_root))
        data = family_store.load_data(data_root)
        (data_root / family_store.PHOTOS).mkdir()
        for person in data['people']:
            if person['photo']:
                # Plain two-tone synthetic portrait (3:4), generated on the fly.
                image = Image.new('RGB', (300, 400), '#6e8a74')
                image.paste('#d9c9a3', (60, 60, 240, 300))
                image.save(family_store.photo_file(data_root, person['photo']))
        payload = build_payload(root=data_root)
        prepare_viewer(ROOT, target)
        write_payload(target, payload)
        shutil.copytree(data_root / family_store.PHOTOS, target / 'photos', dirs_exist_ok=True)
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
            print(f'Синтетический сайт: {url}. Ctrl+C — остановить.')
            try:
                threading.Event().wait()
            except KeyboardInterrupt:
                pass

"""Combine repository code with verified data/media already on Firebase Hosting.

CI never needs family records in Git, secrets, or Actions artifacts. A missing or
inconsistent hosted snapshot fails the build before a new release is deployed.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import tempfile
from urllib.parse import quote, urlsplit
from urllib.request import Request, urlopen

from readonly_assets import DATA_FILE, MANIFEST, prepare_viewer

ROOT = Path(__file__).resolve().parents[1]
PHOTO_PATH = re.compile(r'photos/[A-Za-z0-9_.-]+\.(?:png|jpg|jpeg|webp|gif)', re.I)


def download(url):
    with urlopen(Request(url, headers={'Cache-Control': 'no-cache'}), timeout=60) as response:
        if urlsplit(response.url).netloc != urlsplit(url).netloc:
            raise ValueError('Unexpected redirect from Hosting')
        content = response.read(30 * 1024 * 1024 + 1)
        if len(content) > 30 * 1024 * 1024:
            raise ValueError('Hosted file exceeds 30 MB')
        return content


def build_hosted(source, output, root=ROOT, fetch=download):
    root, output = Path(root).resolve(), Path(output).resolve()
    if not output.is_relative_to(root / 'output') or output == root / 'output':
        raise ValueError('Build output must be a subdirectory of output/')
    origin = urlsplit(source)
    if origin.scheme != 'https' or origin.username or origin.password or origin.query or origin.fragment or origin.path not in ('', '/'):
        raise ValueError('Source must be an HTTPS site origin')
    source = source.rstrip('/')
    manifest_bytes = fetch(source + '/' + MANIFEST)
    manifest = json.loads(manifest_bytes)
    files = manifest.get('files', {})
    if manifest.get('version') != 1 or not isinstance(files, dict) or DATA_FILE not in files:
        raise ValueError('No supported hosted family snapshot. Bootstrap from local data first.')
    if len(files) > 2000:
        raise ValueError('Too many hosted files')
    for name, digest in files.items():
        if name != DATA_FILE and not PHOTO_PATH.fullmatch(name):
            raise ValueError('Unexpected path in hosted data manifest')
        if not isinstance(digest, str) or not re.fullmatch('[0-9a-f]{64}', digest):
            raise ValueError('Invalid hosted SHA-256')
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.viewer-', dir=output.parent) as temp:
        site = Path(temp) / 'site'
        prepare_viewer(root, site)
        for name, digest in files.items():
            content = fetch(source + '/' + quote(name) + '?sha256=' + digest)
            if hashlib.sha256(content).hexdigest() != digest:
                raise ValueError('Hosted file checksum mismatch; deployment stopped')
            destination = site / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(content)
        snapshot = (site / DATA_FILE).read_text()
        prefix, suffix = 'window.GENEALOGY = ', ';\n'
        if not snapshot.startswith(prefix) or not snapshot.endswith(suffix):
            raise ValueError('Invalid hosted snapshot format')
        payload = json.loads(snapshot[len(prefix):-len(suffix)])
        if payload.get('isExample') or not payload['data']['people']:
            raise ValueError('Refusing to replace the real site with an example')
        photos = {p['photo'] for p in payload['data']['people'] if p.get('photo')}
        if set(files) != {DATA_FILE, *photos}:
            raise ValueError('Hosted manifest does not match the family snapshot')
        if set(payload['nodes']) != {p['id'] for p in payload['data']['people']}:
            raise ValueError('Hosted layout does not match people')
        (site / MANIFEST).write_bytes(manifest_bytes)
        if output.exists():
            if output.is_symlink():
                raise ValueError('Output must not be a symlink')
            shutil.rmtree(output)
        shutil.move(str(site), output)
    return len(payload['data']['people']), len(photos)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True)
    parser.add_argument('--output', default=str(ROOT / 'output/firebase/site'))
    args = parser.parse_args()
    people, photos = build_hosted(args.source, args.output)
    print(f'Read-only build verified: {people} people, {photos} photos. No family data added to Git.')

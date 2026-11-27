"""Build the read-only site from Data/ into output/hosting (plus a ZIP of it). Nothing enters Git."""
from datetime import datetime
from pathlib import Path, PurePosixPath
import shutil
import tempfile
import zipfile

import family_store
from build_html import build_payload, write_payload
from readonly_assets import prepare_viewer, write_manifest

ROOT = Path(__file__).resolve().parents[1]


def build_readonly(root=ROOT):
    root = Path(root)
    payload = build_payload(root)
    output = root / 'output/hosting'
    output.mkdir(parents=True, exist_ok=True)
    release = Path(tempfile.mkdtemp(
        prefix=datetime.now().strftime('familytree-%Y%m%d-%H%M%S-'), dir=output))
    site = release / 'site'
    prepare_viewer(root, site)
    write_payload(site, payload)
    photos = {p['photo'] for p in payload['data']['people'] if p['photo']}
    for photo in sorted(photos):
        source = family_store.photo_file(root, photo).resolve()
        if not source.is_relative_to((root / family_store.PHOTOS).resolve()):
            raise ValueError('Photo points outside Data/Photos')
        destination = site / PurePosixPath(photo)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
    write_manifest(site, photos)
    archive = release / 'familytree-readonly.zip'
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as zipped:
        for path in sorted(site.rglob('*')):
            if path.is_file():
                zipped.write(path, path.relative_to(site))
    return site, archive, payload


if __name__ == '__main__':
    site, archive, payload = build_readonly()
    print(f'Read-only upload: {site}')
    print(f'ZIP: {archive}')
    print(f"{len(payload['data']['people'])} people; {len(payload['thumbnails'])} portraits. "
          'Read-only viewer; no backend, source documents or Git metadata.')

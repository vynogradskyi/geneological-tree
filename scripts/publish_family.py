"""Explicitly publish local family updates to Firebase without committing them."""
import argparse
from pathlib import Path
import shutil
import subprocess

from build_readonly import build_readonly

ROOT = Path(__file__).resolve().parents[1]

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--build-only', action='store_true')
    args = parser.parse_args()
    site, archive, payload = build_readonly(ROOT)
    if payload.get('isExample'):
        raise ValueError('Refusing to publish synthetic example data as the family site')
    target = ROOT / 'output/firebase/site'
    if target.exists():
        shutil.rmtree(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(site, target)
    print(f"Prepared {len(payload['nodes'])} people, {len(payload['thumbnails'])} portraits.", flush=True)
    if not args.build_only:
        subprocess.run(['firebase', 'deploy', '--only', 'hosting', '--project', 'familytree-9505c'],
                       cwd=ROOT, check=True)

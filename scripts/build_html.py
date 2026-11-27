"""Build the viewer payload from Data/ and refresh the offline snapshot. Never creates a PDF."""
from pathlib import Path
from io import BytesIO
from datetime import datetime
from zoneinfo import ZoneInfo
import base64
import hashlib
import json
from PIL import Image, ImageOps
import family_store
from genealogy_layout import create_layout
from tree_json import language_payloads, translation_digest
from presentation import load_presentation

ROOT = Path(__file__).resolve().parents[1]
OFFLINE_SNAPSHOT = 'web/family-data.js'


def thumbnail(path):
    with Image.open(path) as source:
        image = ImageOps.exif_transpose(source).convert('RGB')
    image.thumbnail((360, 480), Image.Resampling.LANCZOS)
    stream = BytesIO()
    image.save(stream, format='JPEG', quality=87, optimize=True)
    return 'data:image/jpeg;base64,' + base64.b64encode(stream.getvalue()).decode()


def disconnected_people(data):
    adjacency = {p['id']: set() for p in data['people']}
    for p in data['people']:
        for ref in [p['Mommy'], p['Daddy'], *p['siblings']]:
            if ref:
                adjacency[p['id']].add(ref)
                adjacency[ref].add(p['id'])
    for relation in data['relationships']:
        a, b = relation['personIds']
        adjacency[a].add(b)
        adjacency[b].add(a)
    connected, pending = set(), [data['rootPersonId']]
    while pending:
        pid = pending.pop()
        if pid not in connected:
            connected.add(pid)
            pending.extend(adjacency[pid] - connected)
    return sorted(set(adjacency) - connected)


def build_payload(root=ROOT, data=None, review=None, translations=None):
    root = Path(root)
    data = data if data is not None else family_store.load_data(root)
    review = review if review is not None else family_store.load_review(root)
    translations = translations if translations is not None else family_store.load_translations(root, data)
    presentation = load_presentation(root, data)
    layout = create_layout(data, presentation=presentation)
    assert len(layout['nodes']) == len(data['people'])
    return {
        'translations': translations,
        'translationSha256': translation_digest(translations),
        'data': data, **layout,
        'thumbnails': {p['id']: thumbnail(family_store.photo_file(root, p['photo'])) for p in data['people'] if p['photo']},
        'presentation': presentation,
        'isExample': review.get('isExample', False),
        'disconnectedPeople': disconnected_people(data),
        'issues': [q for q in review['issues'] if q['status'] == 'otwarte'],
        'credits': review.get('photoCredits', []),
        'updatedOn': datetime.now(ZoneInfo('Europe/Warsaw')).strftime('%d.%m.%Y'),
        'sourceSha256': hashlib.sha256(family_store.dumps(data).encode()).hexdigest(),
    }


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))


def payload_files(target, payload, snapshots=True):
    """web/family-data.js (file:// viewing) and, for a site, data/tree*.json."""
    target = Path(target)
    files = {target / OFFLINE_SNAPSHOT: 'window.GENEALOGY = ' + compact(payload).replace('<', '\\u003c') + ';\n'}
    if snapshots:
        files[target / 'data/tree.json'] = compact({k: v for k, v in payload.items() if k != 'translations'}) + '\n'
        files.update({target / f'data/tree.{lang}.json': compact(value) + '\n' for lang, value in language_payloads(payload).items()})
    return files


def write_payload(target, payload, snapshots=True):
    family_store.atomic_write(payload_files(target, payload, snapshots))


if __name__ == '__main__':
    from init_example import initialize_example
    initialize_example(ROOT)
    payload = build_payload(ROOT)
    write_payload(ROOT, payload, snapshots=False)
    print(f"Offline snapshot refreshed: {len(payload['nodes'])} people, {len(payload['thumbnails'])} portraits, {payload['generations']} generations. No PDF generated.")

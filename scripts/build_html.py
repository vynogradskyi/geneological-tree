"""Refresh the offline HTML data without generating a PDF."""
from pathlib import Path
from io import BytesIO
from datetime import datetime
from zoneinfo import ZoneInfo
import base64
import hashlib
import json
import os
from PIL import Image, ImageOps
from genealogy_layout import create_layout
from tree_json import load_translations, write_json_payload, language_payloads, translation_digest
from presentation import load_presentation

def build_payload(root=None, data=None, review=None):
    ROOT = Path(root or Path(__file__).resolve().parents[1])
    data = data if data is not None else json.loads((ROOT / 'family-tree.json').read_text())
    review = review if review is not None else json.loads((ROOT / 'family-tree-review.json').read_text())
    presentation=load_presentation(ROOT, data)
    layout=create_layout(data, presentation=presentation)
    thumbnails = {}
    for p in data['people']:
        if not p['photo']:
            continue
        with Image.open(ROOT / p['photo']) as source:
            image = ImageOps.exif_transpose(source).convert('RGB')
            image.thumbnail((360, 480), Image.Resampling.LANCZOS)
            stream = BytesIO()
            image.save(stream, format='JPEG', quality=87, optimize=True)
            thumbnails[p['id']] = 'data:image/jpeg;base64,' + base64.b64encode(stream.getvalue()).decode()
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
    translations=load_translations(ROOT)
    payload = {
        'translations': translations,
        'translationSha256': translation_digest(translations),
        'data': data, **layout, 'thumbnails': thumbnails, 'presentation': presentation,
        'isExample': review.get('isExample', False),
        'disconnectedPeople': sorted(set(adjacency) - connected),
        'issues': [q for q in review['issues'] if q['status'] == 'otwarte'],
        'credits': review.get('photoCredits', []),
        'updatedOn': datetime.now(ZoneInfo('Europe/Warsaw')).strftime('%d.%m.%Y'),
        'sourceSha256': hashlib.sha256(json.dumps(data, ensure_ascii=False, indent=2).encode()+b'\n').hexdigest(),
    }
    assert len(layout['nodes']) == len(data['people'])
    return payload


def write_payload(root, payload):
    root=Path(root)
    encoded=json.dumps(payload,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')
    outputs={root/'web/family-data.js':'window.GENEALOGY = '+encoded+';\n',
             root/'data/tree.json':json.dumps({k:v for k,v in payload.items() if k!='translations'},ensure_ascii=False,separators=(',',':'))+'\n'}
    outputs.update({root/f'data/tree.{lang}.json':json.dumps(value,ensure_ascii=False,separators=(',',':'))+'\n' for lang,value in language_payloads(payload).items()})
    previous={path:path.read_bytes() if path.exists() else None for path in outputs}
    staged={}
    try:
        for path,text in outputs.items():
            path.parent.mkdir(parents=True,exist_ok=True)
            temp=path.with_suffix(path.suffix+'.tmp');staged[path]=temp;temp.write_text(text)
        for path,temp in staged.items():temp.replace(path)
    except Exception:
        for path,content in previous.items():
            if content is None:path.unlink(missing_ok=True)
            else:path.write_bytes(content)
        raise
    finally:
        for temp in staged.values():temp.unlink(missing_ok=True)


if __name__ == '__main__':
    root = Path(__file__).resolve().parents[1]
    from init_example import initialize_example
    initialize_example(root)
    payload = build_payload(root)
    write_payload(root, payload)
    print(f"HTML data refreshed: {len(payload['nodes'])} people, {len(payload['thumbnails'])} portraits, {payload['generations']} generations. No PDF generated.")

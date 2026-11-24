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

def build_payload(root=None, data=None, review=None):
    ROOT = Path(root or Path(__file__).resolve().parents[1])
    data = data if data is not None else json.loads((ROOT / 'family-tree.json').read_text())
    review = review if review is not None else json.loads((ROOT / 'family-tree-review.json').read_text())
    graph, ranks, branches, direct, generations = create_layout(data, ROOT / 'tmp/web/layout')
    width, height = map(float, graph['bb'].split(',')[2:])
    objects = {obj['_gvid']: obj for obj in graph['objects']}
    nodes = {}
    for obj in graph['objects']:
        if not obj['name'].startswith('person_') or 'pos' not in obj:
            continue
        x, y = map(float, obj['pos'].split(','))
        w, h = float(obj['width']) * 72, float(obj['height']) * 72
        nodes[obj['name']] = {'x': x-w/2, 'y': height-y-h/2, 'w': w, 'h': h}
    edges = []
    for edge in graph['edges']:
        if edge.get('style') == 'invis' or not edge.get('kind'):
            continue
        paths = []
        for drawing in edge.get('_draw_', []):
            if drawing['op'] == 'b':
                paths.append([[x, height-y] for x, y in drawing['points']])
        labels = [{'text': d['text'], 'x': d['pt'][0], 'y': height-d['pt'][1]}
                  for d in edge.get('_ldraw_', []) if d['op'] == 'T']
        edges.append({'kind': edge['kind'], 'paths': paths, 'labels': labels,
                      'tail': objects[edge['tail']]['name'], 'head': objects[edge['head']]['name']})
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
    payload = {
        'data': data, 'nodes': nodes, 'edges': edges, 'width': width, 'height': height,
        'ranks': ranks, 'branches': branches, 'direct': sorted(direct),
        'generations': generations, 'thumbnails': thumbnails,
        'disconnectedPeople': sorted(set(adjacency) - connected),
        'issues': [q for q in review['issues'] if q['status'] == 'otwarte'],
        'credits': review.get('photoCredits', []),
        'updatedOn': datetime.now(ZoneInfo('Europe/Warsaw')).strftime('%d.%m.%Y'),
        'sourceSha256': hashlib.sha256(json.dumps(data, ensure_ascii=False, indent=2).encode()+b'\n').hexdigest(),
    }
    assert len(nodes) == len(data['people'])
    return payload


def write_payload(root, payload):
    target = Path(root) / 'web/family-data.js'
    encoded = json.dumps(payload, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
    temp = target.with_suffix('.js.tmp')
    temp.write_text('window.GENEALOGY = ' + encoded + ';\n')
    temp.replace(target)


if __name__ == '__main__':
    root = Path(__file__).resolve().parents[1]
    payload = build_payload(root)
    write_payload(root, payload)
    print(f"HTML data refreshed: {len(payload['nodes'])} people, {len(payload['thumbnails'])} portraits, {payload['generations']} generations. No PDF generated.")

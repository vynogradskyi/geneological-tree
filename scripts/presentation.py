"""Private, explicit display preferences; family facts remain in the canonical JSON."""
import json
from pathlib import Path
import re


def load_presentation(root, data):
    path = Path(root) / 'family-presentation.json'
    if not path.exists():
        return {}
    value = json.loads(path.read_text())
    if not isinstance(value, dict) or value.get('version') != 1 or set(value) - {'version', 'layout', 'colors'}:
        raise ValueError('Nieprawidłowe ustawienia wyświetlania.')
    ids = {p['id'] for p in data['people']}
    layout = value.get('layout', {})
    if not isinstance(layout, dict) or set(layout) - {'adjacentParents', 'before', 'rightBranches'}:
        raise ValueError('Nieprawidłowe ustawienia układu.')
    def pair(items):
        if not isinstance(items, list) or len(items) != 2 or len(set(items)) != 2 or not all(x in ids for x in items):
            raise ValueError('Nieprawidłowe osoby w ustawieniach układu.')
    for key in ('adjacentParents', 'before'):
        for items in layout.get(key, []):
            pair(items)
    for branch in layout.get('rightBranches', []):
        if set(branch) != {'person', 'after'} or branch['person'] not in ids:
            raise ValueError('Nieprawidłowa gałąź boczna.')
        pair(branch['after'])
        if branch['person'] in branch['after']:
            raise ValueError('Gałąź boczna musi być osobnym blokiem.')
    colors = value.get('colors', {})
    if not isinstance(colors, dict) or any(pid not in ids or not isinstance(color, str) or not re.fullmatch(r'#[0-9a-fA-F]{6}', color) for pid, color in colors.items()):
        raise ValueError('Nieprawidłowy kolor linii rodzinnej.')
    if any((p['Mommy'] or p['Daddy']) for p in data['people'] if p['id'] in colors):
        raise ValueError('Osobny kolor jest przeznaczony dla zewnętrznej linii bez znanych rodziców.')
    return value

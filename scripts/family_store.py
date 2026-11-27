"""Local family records in Data/ (kept out of Git except the schema).

Layout:
    Data/Information/family-tree.pl.json   canonical records (Polish); facts, links, dates, photos
    Data/Information/family-tree.ru.json   full Russian copy of the same records
    Data/Information/family-tree.en.json   full English copy of the same records
    Data/Information/family-tree.uk.json   full Ukrainian copy of the same records
    Data/Information/family-tree.schema.json
    Data/Photos/                           portraits; records refer to them as photos/<file>
    Data/Project/                          working files: review log, display preferences
    Data/Sources/, Data/Backups/           source documents and editor backups

RU/EN files repeat every person with all fields, so each file can be read on its own.
Only the text fields in FIELDS may differ from the Polish file. `translation.people`
remembers the Polish text each translation was made from; when the Polish text changes,
the site shows Polish instead of an outdated translation. The editor rewrites all three
files on every save. In memory the rest of the code works with the Polish records plus
a per-language overlay:
    {lang: {'language', 'people': {id: {'source': {...}, 'values': {...}}}, 'issues': {...}}}
"""
import copy
import hashlib
import json
from pathlib import Path, PurePosixPath

from editor_validation import validate_document

LANGUAGES = ('pl', 'ru', 'en', 'uk')
TRANSLATED = ('ru', 'en', 'uk')
FIELDS = ('firstName', 'lastName', 'maidenName', 'patronymic', 'formerLastNames', 'title', 'occupation',
          'notes', 'deathCircumstances', 'birthDateNote', 'deathDateNote', 'birthPlace', 'deathPlace')

DATA = Path('Data')
INFORMATION = DATA / 'Information'
PHOTOS = DATA / 'Photos'
PROJECT = DATA / 'Project'
SOURCES = DATA / 'Sources'
BACKUPS = DATA / 'Backups'
SCHEMA_NAME = 'family-tree.schema.json'
PHOTO_PREFIX = 'photos/'


def information_path(root, lang='pl'):
    return Path(root) / INFORMATION / f'family-tree.{lang}.json'


def schema_path(root):
    return Path(root) / INFORMATION / SCHEMA_NAME


def review_path(root):
    return Path(root) / PROJECT / 'family-tree-review.json'


def presentation_path(root):
    return Path(root) / PROJECT / 'family-presentation.json'


def photo_file(root, photo):
    """Map a record value such as photos/person_0001.png to Data/Photos/person_0001.png."""
    relative = PurePosixPath(photo)
    if relative.is_absolute() or len(relative.parts) != 2 or relative.parts[0] != PHOTO_PREFIX.rstrip('/') or relative.name in ('.', '..'):
        raise ValueError(f'Expected photos/<file>: {photo}')
    return Path(root) / PHOTOS / relative.name


def read_json(path):
    return json.loads(Path(path).read_text())


def dumps(value):
    return json.dumps(value, ensure_ascii=False, indent=2) + '\n'


def load_data(root):
    return read_json(information_path(root, 'pl'))


def load_review(root):
    return read_json(review_path(root))


def _empty(lang):
    return {'language': lang, 'people': {}, 'issues': {}}


def facts_digest(data):
    """Fingerprint of the Polish records a language file was generated from."""
    return hashlib.sha256(json.dumps(data, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def overlay_from_document(data, document, lang):
    """Full RU/EN copy -> overlay.

    If the Polish file is unchanged since the copy was written, the copy may be edited by hand:
    a changed text field becomes a translation, a changed fact is an error. If the Polish file
    changed in the meantime, facts and untranslated text are taken from it and only the
    remembered translations are kept (outdated ones are detected by their Polish source).
    """
    name = f'family-tree.{lang}.json'
    if document.get('language') != lang:
        raise ValueError(f'{name}: pole "language" musi mieć wartość "{lang}".')
    memory = document.get('translation', {})
    remembered = memory.get('people', {})
    synced = memory.get('plSha256') == facts_digest(data)
    copies = {p.get('id'): p for p in document.get('people', [])}
    if synced and (document.get('rootPersonId') != data['rootPersonId'] or document.get('relationships') != data['relationships']
                   or list(copies) != [p['id'] for p in data['people']]):
        raise ValueError(f'{name}: osoby, osoba główna i małżeństwa muszą być takie jak w family-tree.pl.json. '
                         'Zmieniaj je tylko w pliku polskim.')
    overlay = _empty(lang)
    overlay['issues'] = copy.deepcopy(memory.get('issues', {}))
    for original in data['people']:
        pid = original['id']
        person = copies.get(pid)
        if person is None:
            continue
        if synced:
            for key in (person.keys() | original.keys()) - set(FIELDS):
                if person.get(key) != original.get(key):
                    raise ValueError(f'{name}: {pid}.{key} różni się od family-tree.pl.json. '
                                     'Daty, powiązania i zdjęcia zmienia się tylko w pliku polskim.')
        sources = remembered.get(pid, {})
        entry = {'source': {}, 'values': {}}
        for key in FIELDS:
            if key in sources:
                entry['source'][key] = copy.deepcopy(sources[key])
                entry['values'][key] = copy.deepcopy(person.get(key))
            elif synced and key in person and person[key] != original.get(key):
                entry['source'][key] = copy.deepcopy(original.get(key))
                entry['values'][key] = copy.deepcopy(person[key])
        if entry['values']:
            overlay['people'][pid] = entry
    return overlay


def document_from_overlay(data, overlay, lang):
    """Polish records + overlay -> full RU/EN copy."""
    document = copy.deepcopy(data)
    document['language'] = lang
    remembered = {}
    for person in document['people']:
        entry = overlay.get('people', {}).get(person['id'])
        if not entry:
            continue
        for key, value in entry['values'].items():
            if key in FIELDS:
                person[key] = copy.deepcopy(value)
                remembered.setdefault(person['id'], {})[key] = copy.deepcopy(entry['source'].get(key))
    document['translation'] = {'from': 'family-tree.pl.json', 'plSha256': facts_digest(data), 'people': remembered,
                               'issues': copy.deepcopy(overlay.get('issues', {}))}
    return document


def load_translations(root, data=None):
    data = data if data is not None else load_data(root)
    result = {}
    schema = read_json(schema_path(root)) if schema_path(root).exists() else None
    for lang in TRANSLATED:
        path = information_path(root, lang)
        if not path.exists():
            result[lang] = _empty(lang)
            continue
        document = read_json(path)
        if schema:
            try:
                validate_document(document, schema)
            except ValueError as error:
                raise ValueError(f'{path.name}: {error}') from None
        result[lang] = overlay_from_document(data, document, lang)
    return result


def information_documents(data, translations):
    documents = {'pl': data}
    for lang in TRANSLATED:
        documents[lang] = document_from_overlay(data, translations.get(lang) or _empty(lang), lang)
    return documents


def atomic_write(files):
    """Write {path: text} together; on failure restore every previous file."""
    previous = {path: path.read_bytes() if path.exists() else None for path in files}
    staged = {}
    try:
        for path, text in files.items():
            path.parent.mkdir(parents=True, exist_ok=True)
            temp = path.with_suffix(path.suffix + '.tmp')
            staged[path] = temp
            temp.write_text(text)
        for path, temp in staged.items():
            temp.replace(path)
    except Exception:
        for path, content in previous.items():
            if content is None:
                path.unlink(missing_ok=True)
            else:
                path.write_bytes(content)
        raise
    finally:
        for temp in staged.values():
            temp.unlink(missing_ok=True)


def save_information(root, data, translations):
    atomic_write({information_path(root, lang): dumps(document)
                  for lang, document in information_documents(data, translations).items()})

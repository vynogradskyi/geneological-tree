"""Local-only editor (127.0.0.1); records and portraits are saved in Data/."""
import argparse
import base64
import copy
from datetime import datetime
from functools import partial
import hashlib
import hmac
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
import json
from pathlib import Path
import posixpath
import secrets
import shutil
import threading
from urllib.parse import unquote, urlparse
import webbrowser
from zoneinfo import ZoneInfo
from PIL import Image
import family_store
from family_store import FIELDS
from build_html import build_payload, compact, payload_files, write_payload
from tree_json import JSON_FILES, language_payloads, merge_translation, translation_digest
from editor_validation import validate_document

MAX_BODY = 38 * 1024 * 1024


class EditorHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, directory=None, **kwargs):
        self.root = Path(directory)
        super().__init__(*args, directory=directory, **kwargs)

    def json_response(self, code, value):
        raw = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(raw)))
        self.end_headers()
        try:
            self.wfile.write(raw)
        except (BrokenPipeError, ConnectionResetError):
            pass  # The browser may close after a successfully committed save.

    def allowed_origin(self):
        host = self.headers.get('Host', '')
        if host not in {f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'}:
            return False
        origin = self.headers.get('Origin')
        return origin is None or origin in {f'http://127.0.0.1:{self.server.server_port}', f'http://localhost:{self.server.server_port}'}

    def current_payload(self):
        """Rebuild when Data/Information was changed outside the editor."""
        data = family_store.load_data(self.root)
        translations = family_store.load_translations(self.root, data)
        payload = self.server.payload
        if (hashlib.sha256(family_store.dumps(data).encode()).hexdigest() != payload['sourceSha256']
                or translation_digest(translations) != payload['translationSha256']):
            payload = self.server.payload = build_payload(self.root, data, translations=translations)
            write_payload(self.root, payload, snapshots=False)
        return payload

    def send_bytes(self, raw, content_type):
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        if not self.allowed_origin():
            return self.json_response(403, {'error': 'Niedozwolone źródło żądania.'})
        path = posixpath.normpath(unquote(urlparse(self.path).path))
        if path == '/api/state':
            with self.server.edit_lock:
                return self.json_response(200, {'state': self.current_payload(), 'token': self.server.edit_token})
        if path.lstrip('/') in JSON_FILES:
            # The same snapshot files the site serves, generated from memory: Data/ is the only store.
            with self.server.edit_lock:
                payload = self.current_payload()
            name = path.lstrip('/')
            value = ({k: v for k, v in payload.items() if k != 'translations'} if name == 'data/tree.json'
                     else language_payloads(payload)[name.removeprefix('data/tree.').removesuffix('.json')])
            return self.send_bytes((compact(value) + '\n').encode(), 'application/json; charset=utf-8')
        if path.startswith('/photos/'):
            self.path = '/' + (family_store.PHOTOS / path.removeprefix('/photos/')).as_posix()
        elif path.lower().startswith('/data/') or '/.' in path:
            # Records, backups and source documents are not browsed; photos go through /photos/.
            return self.json_response(404, {'error': 'Nie znaleziono.'})
        super().do_GET()

    def do_POST(self):
        if urlparse(self.path).path != '/api/person':
            return self.json_response(404, {'error': 'Nie znaleziono.'})
        if not self.allowed_origin() or not hmac.compare_digest(self.headers.get('X-Editor-Token', ''), self.server.edit_token):
            return self.json_response(403, {'error': 'Odśwież stronę, aby ponownie połączyć edytor.'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= MAX_BODY:
                raise ValueError('Za duży plik. Maksymalny rozmiar zdjęcia: 25 MB.')
            request = json.loads(self.rfile.read(length))
            with self.server.edit_lock:
                payload = self.save_person(request)
            return self.json_response(200, {'state': payload})
        except Conflict as error:
            return self.json_response(409, {'error': str(error)})
        except (ValueError, KeyError, TypeError) as error:
            return self.json_response(400, {'error': str(error)})
        except Exception:
            return self.json_response(500, {'error': 'Nie udało się zapisać zmian. Oryginalne dane zachowano; spróbuj ponownie.'})

    def save_person(self, request):
        data = family_store.load_data(self.root)
        translations = family_store.load_translations(self.root, data)
        review = family_store.load_review(self.root)
        by_id = {p['id']: p for p in data['people']}
        person = copy.deepcopy(request['person'])
        pid = person['id']
        if pid not in by_id:
            raise ValueError('Nie znaleziono osoby.')
        original = by_id[pid]
        if original != request.get('basePerson'):
            raise Conflict('Ta osoba została zmieniona w innym oknie. Odśwież stronę przed ponowną edycją; Twoje pola pozostają w formularzu.')
        old_marriages = [r for r in data['relationships'] if pid in r['personIds']]
        if old_marriages != request.get('baseMarriages', old_marriages):
            raise Conflict('Powiązania tej osoby zmieniły się. Odśwież stronę przed ponowną edycją.')
        entry=request.get('translation')
        if entry:
            lang=entry.get('language')
            if translations.get(lang,{}).get('people',{}).get(pid)!=request.get('baseTranslation'):
                raise Conflict('Dane zmieniły się w innym oknie. Odśwież stronę przed zapisaniem.')
            source={key:original.get(key) for key in FIELDS}
            if lang not in family_store.TRANSLATED or entry.get('source')!=source or not isinstance(entry.get('values'),dict) or not set(entry['values'])<=set(FIELDS):
                raise ValueError('Nieprawidłowe tłumaczenie.')
            merge_translation(translations,pid,entry)
        photo_bytes = None
        new_photo = None
        if request.get('photo'):
            raw = request['photo']['dataUrl'].split(',', 1)[1]
            photo_bytes = base64.b64decode(raw, validate=True)
            if len(photo_bytes) > 25*1024*1024:
                raise ValueError('Maksymalny rozmiar zdjęcia: 25 MB.')
            try:
                with Image.open(BytesIO(photo_bytes)) as image:
                    if image.width*image.height > 65_000_000:
                        raise ValueError('Zdjęcie jest zbyt duże; wybierz wersję do 65 megapikseli.')
                    ext = {'JPEG': 'jpg', 'PNG': 'png', 'WEBP': 'webp', 'GIF': 'gif'}.get(image.format)
                    image.verify()
            except (OSError, SyntaxError):
                raise ValueError('Nieprawidłowy plik zdjęcia.')
            if not ext:
                raise ValueError('Wybierz zdjęcie JPG, PNG, WebP lub GIF.')
            new_photo = f'photos/{pid}_{hashlib.sha256(photo_bytes).hexdigest()[:12]}.{ext}'
            person['photo'] = new_photo
        elif request.get('removePhoto'):
            person['photo'] = None
        elif person.get('photo') != original['photo']:
            raise ValueError('Aby zmienić zdjęcie, wybierz plik lub usuń obecne przypisanie.')
        for sibling in data['people']:
            if sibling['id'] == pid:
                continue
            if sibling['id'] in person['siblings'] and pid not in sibling['siblings']:
                sibling['siblings'].append(pid)
            if sibling['id'] not in person['siblings'] and pid in sibling['siblings']:
                sibling['siblings'].remove(pid)
        data['people'] = [person if p['id'] == pid else p for p in data['people']]
        marriages = request.get('marriages', old_marriages)
        if any(pid not in r['personIds'] for r in marriages):
            raise ValueError('Małżeństwo musi dotyczyć edytowanej osoby.')
        untouched = [r for r in data['relationships'] if pid not in r['personIds']]
        if set(r['id'] for r in untouched) & set(r['id'] for r in marriages):
            raise ValueError('Identyfikator małżeństwa jest już zajęty.')
        replacements = {r['id']: r for r in marriages}
        original_ids = {r['id'] for r in data['relationships']}
        data['relationships'] = [replacements.get(r['id'], r) for r in data['relationships']
                                 if pid not in r['personIds'] or r['id'] in replacements]
        data['relationships'].extend(r for r in marriages if r['id'] not in original_ids)
        validate_document(data, family_store.read_json(family_store.schema_path(self.root)))
        if person['photo'] and not photo_bytes and not family_store.photo_file(self.root, person['photo']).is_file():
            raise ValueError('Nie znaleziono pliku zdjęcia.')
        now = datetime.now(ZoneInfo('Europe/Warsaw'))
        review.setdefault('editorHistory', []).append({'personId': pid, 'savedAt': now.isoformat(),
            'changedFields': [key for key in person if person.get(key) != original.get(key)],
            'photo': person.get('photo'), 'source': 'Ręczna edycja zatwierdzona przyciskiem Zapisz.'})
        review['renderStatus']['dataChangedSinceRender'] = True
        review['renderStatus']['status'] = 'PDF wymaga odświeżenia po ręcznej edycji danych.'
        review['renderStatus']['pendingPersonIds'] = sorted(set(review['renderStatus'].get('pendingPersonIds', [])) | {pid})
        review['missingParents'] = [{'personId': p['id'], 'MommyMissing': p['Mommy'] is None, 'DaddyMissing': p['Daddy'] is None}
                                   for p in data['people'] if p['Mommy'] is None or p['Daddy'] is None]
        photo_target = family_store.photo_file(self.root, new_photo) if new_photo else None
        photo_existed = photo_target and photo_target.exists()
        try:
            if photo_target:
                photo_target.parent.mkdir(parents=True, exist_ok=True)
                photo_target.write_bytes(photo_bytes)
            try:
                payload = build_payload(self.root, data, review, translations)
            except AssertionError:
                raise ValueError('Powiązania wskazują sprzeczne pokolenia. Sprawdź rodziców, rodzeństwo i małżeństwa.')
            review['disconnectedPeople'] = payload['disconnectedPeople']
            review['summary']['allPeopleConnectedToRoot'] = not payload['disconnectedPeople']
            review['htmlStatus'].update(status='aktualny', sourceSha256=payload['sourceSha256'],
                portraitCount=len(payload['thumbnails']), updatedOn=now.date().isoformat())
            self.backup(now)
            files = {family_store.information_path(self.root, lang): family_store.dumps(document)
                     for lang, document in family_store.information_documents(data, translations).items()}
            files[family_store.review_path(self.root)] = family_store.dumps(review)
            files.update(payload_files(self.root, payload, snapshots=False))
            family_store.atomic_write(files)  # all files or none
            self.server.payload = payload
            return payload
        except Exception:
            if photo_target and not photo_existed:
                photo_target.unlink(missing_ok=True)
            raise

    def backup(self, now):
        target = self.root/family_store.BACKUPS/'editor'/now.strftime('%Y%m%d-%H%M%S-%f')
        target.mkdir(parents=True)
        for source in [*(family_store.information_path(self.root, lang) for lang in family_store.LANGUAGES),
                       family_store.review_path(self.root)]:
            if source.exists():
                shutil.copy2(source, target/source.name)


class Conflict(ValueError):
    pass


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    from init_example import initialize_example
    if initialize_example(args.root):
        print('Utworzono syntetyczne dane demonstracyjne w lokalnych plikach.', flush=True)
    handler = partial(EditorHandler, directory=str(args.root.resolve()))
    server = ThreadingHTTPServer(('127.0.0.1', args.port), handler)
    server.edit_lock = threading.Lock()
    server.edit_token = secrets.token_urlsafe(32)
    server.payload = build_payload(args.root)
    write_payload(args.root, server.payload, snapshots=False)
    url = f'http://127.0.0.1:{server.server_port}/'
    print(f'Edytor drzewa: {url}', flush=True)
    print('Zmiany zapisują się w Data/Information, zdjęcia w Data/Photos. Zatrzymanie: Ctrl+C.', flush=True)
    if not args.no_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()

"""Local-only editor; all data and portraits stay in the project directory."""
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
import secrets
import threading
from urllib.parse import urlparse
import webbrowser
from zoneinfo import ZoneInfo
from PIL import Image
from build_html import build_payload, write_payload
from editor_validation import validate_document

MAX_BODY = 38 * 1024 * 1024


def atomic_json(path, data):
    temp = path.with_suffix(path.suffix+'.tmp')
    temp.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n')
    temp.replace(path)


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

    def do_GET(self):
        if not self.allowed_origin():
            return self.json_response(403, {'error': 'Niedozwolone źródło żądania.'})
        if urlparse(self.path).path == '/api/state':
            with self.server.edit_lock:
                current_hash = hashlib.sha256((self.root/'family-tree.json').read_bytes()).hexdigest()
                if current_hash != self.server.payload['sourceSha256']:
                    self.server.payload = build_payload(self.root)
                    write_payload(self.root, self.server.payload)
                payload = self.server.payload
                return self.json_response(200, {'state': payload, 'token': self.server.edit_token})
        # Backups are for recovery, not browser navigation.
        if urlparse(self.path).path.startswith('/backups/'):
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
        data_path = self.root/'family-tree.json'
        review_path = self.root/'family-tree-review.json'
        data = json.loads(data_path.read_text())
        review = json.loads(review_path.read_text())
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
        schema = json.loads((self.root/'family-tree.schema.json').read_text())
        validate_document(data, schema)
        if person['photo'] and not photo_bytes and not (self.root/person['photo']).is_file():
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
        photo_target = self.root/new_photo if new_photo else None
        photo_existed = photo_target and photo_target.exists()
        try:
            if photo_target:
                photo_target.write_bytes(photo_bytes)
            try:
                payload = build_payload(self.root, data, review)
            except AssertionError:
                raise ValueError('Powiązania wskazują sprzeczne pokolenia. Sprawdź rodziców, rodzeństwo i małżeństwa.')
            review['disconnectedPeople'] = payload['disconnectedPeople']
            review['summary']['allPeopleConnectedToRoot'] = not payload['disconnectedPeople']
            backup = self.root/'backups/editor'/now.strftime('%Y%m%d-%H%M%S-%f')
            backup.mkdir(parents=True)
            (backup/'family-tree.json').write_bytes(data_path.read_bytes())
            (backup/'family-tree-review.json').write_bytes(review_path.read_bytes())
            review['htmlStatus'].update(status='aktualny', sourceSha256=payload['sourceSha256'],
                portraitCount=len(payload['thumbnails']), updatedOn=now.date().isoformat())
            atomic_json(data_path, data)
            try:
                atomic_json(review_path, review)
                write_payload(self.root, payload)
            except Exception:
                data_path.write_bytes((backup/'family-tree.json').read_bytes())
                review_path.write_bytes((backup/'family-tree-review.json').read_bytes())
                raise
            self.server.payload = payload
            return payload
        except Exception:
            if photo_target and not photo_existed:
                photo_target.unlink(missing_ok=True)
            raise


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
    write_payload(args.root, server.payload)
    url = f'http://127.0.0.1:{server.server_port}/'
    print(f'Edytor drzewa: {url}', flush=True)
    print('Zmiany i zdjęcia zapisują się w folderze projektu. Zatrzymanie: Ctrl+C.', flush=True)
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

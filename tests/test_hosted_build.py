"""Synthetic-only checks for preserving hosted photos across code deployments."""
import copy
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from build_hosted import build_hosted
from readonly_assets import DATA_FILE, MANIFEST


class HostedBuildTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=ROOT / 'tmp')
        self.root = Path(self.temp.name)
        self.output = self.root / 'output/site'
        self.photo = 'photos/synthetic.jpg'
        payload = {'data': {'people': [{'id': 'test_1', 'photo': self.photo}]},
                   'nodes': {'test_1': {'x': 1}}, 'isExample': False}
        self.files = {
            DATA_FILE: ('window.GENEALOGY = ' + json.dumps(payload) + ';\n').encode(),
            'data/tree.json': json.dumps(payload).encode(),
            **{f'data/tree.{lang}.json': json.dumps({'language': lang, 'people': {}, 'issues': {}}).encode()
               for lang in ('pl', 'ru', 'en', 'uk')},
            self.photo: b'synthetic test media - not a real family photo',
        }
        self.manifest = {'version': 2, 'files': {
            name: hashlib.sha256(content).hexdigest() for name, content in self.files.items()}}
        # Copy source assets only, never local family data.
        import shutil
        shutil.copyfile(ROOT / 'index.html', self.root / 'index.html')
        from readonly_assets import ASSETS
        for asset in ASSETS:
            path = self.root / asset
            path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / asset, path)

    def tearDown(self):
        self.temp.cleanup()

    def fetch(self, url):
        path = urlsplit(url).path.lstrip('/')
        return json.dumps(self.manifest).encode() if path == MANIFEST else self.files[path]

    def build(self):
        return build_hosted('https://synthetic.web.app', self.output, self.root, self.fetch)

    def test_preserves_data_and_media_as_read_only_viewer(self):
        self.assertEqual(self.build(), (1, 1))
        for name, content in self.files.items():
            self.assertEqual((self.output / name).read_bytes(), content)
        self.assertEqual(json.loads((self.output / MANIFEST).read_text()), self.manifest)
        html = (self.output / 'index.html').read_text()
        self.assertNotIn('family-login', html)
        self.assertNotIn('toggle-card-drag', html)
        self.assertFalse((self.output / 'web/family-users.json').exists())
        self.assertIn('id="download-pdf"', html)
        self.assertEqual(self.build(), (1, 1))

    def test_rejects_unsupported_manifest_and_inconsistent_json(self):
        self.manifest['version'] = 1
        with self.assertRaisesRegex(ValueError, 'No supported'):
            self.build()
        self.manifest['version'] = 2
        altered=json.loads(self.files['data/tree.json'])
        altered['data']['people'][0]['photo']=None
        self.files['data/tree.json']=json.dumps(altered).encode()
        self.manifest['files']['data/tree.json']=hashlib.sha256(self.files['data/tree.json']).hexdigest()
        with self.assertRaisesRegex(ValueError,'does not match'):
            self.build()

    def test_changed_or_missing_media_keeps_previous_build(self):
        self.build()
        previous = (self.output / self.photo).read_bytes()
        self.files[self.photo] = b'different media'
        with self.assertRaisesRegex(ValueError, 'checksum'):
            self.build()
        self.assertEqual((self.output / self.photo).read_bytes(), previous)
        del self.files[self.photo]
        with self.assertRaises(KeyError):
            self.build()
        self.assertEqual((self.output / self.photo).read_bytes(), previous)

    def test_rejects_path_traversal_and_extra_files(self):
        for path in ('../secret', 'photos/../../secret.jpg', 'web/editor.js', '/photos/test.jpg'):
            with self.subTest(path=path):
                original = copy.deepcopy(self.manifest)
                self.manifest['files'][path] = 'a' * 64
                with self.assertRaisesRegex(ValueError, 'Unexpected path'):
                    self.build()
                self.manifest = original

    def test_manifest_must_cover_exact_photo_set(self):
        del self.manifest['files'][self.photo]
        with self.assertRaisesRegex(ValueError, 'does not match'):
            self.build()

    def test_rejects_wrong_source_or_output(self):
        for source in ('http://synthetic.web.app', 'https://user:secret@synthetic.web.app', 'https://synthetic.web.app/path'):
            with self.assertRaises(ValueError):
                build_hosted(source, self.output, self.root, self.fetch)
        with self.assertRaises(ValueError):
            build_hosted('https://synthetic.web.app', self.root / 'web', self.root, self.fetch)


class PresentationPreferencesTest(unittest.TestCase):
    def test_private_preferences_validate_without_changing_family_facts(self):
        from presentation import load_presentation
        with tempfile.TemporaryDirectory(dir=ROOT / 'tmp') as directory:
            root = Path(directory)
            data = {'people': [{'id': 'mother', 'Mommy': None, 'Daddy': None},
                               {'id': 'father', 'Mommy': None, 'Daddy': None}]}
            before = copy.deepcopy(data)
            self.assertEqual(load_presentation(root, data), {})
            path = root / 'Data/Project/family-presentation.json'
            path.parent.mkdir(parents=True)
            settings = {'version': 1, 'layout': {'adjacentParents': [['mother', 'father']]},
                        'colors': {'father': '#a46b42'}}
            path.write_text(json.dumps(settings))
            self.assertEqual(load_presentation(root, data), settings)
            self.assertEqual(data, before)
            for invalid in [dict(settings, colors={'missing': '#a46b42'}),
                            dict(settings, colors={'father': 'red<script>'}),
                            dict(settings, layout={'before': [['mother', 'missing']]}),
                            dict(settings, arbitraryFacts=True)]:
                path.write_text(json.dumps(invalid))
                with self.assertRaises(ValueError):
                    load_presentation(root, data)


if __name__ == '__main__':
    (ROOT / 'tmp').mkdir(exist_ok=True)
    unittest.main()

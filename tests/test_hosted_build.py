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
            self.photo: b'synthetic test media - not a real family photo',
        }
        self.manifest = {'version': 1, 'files': {
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

    def test_preserves_data_and_media_with_new_readonly_code(self):
        self.assertEqual(self.build(), (1, 1))
        for name, content in self.files.items():
            self.assertEqual((self.output / name).read_bytes(), content)
        html = (self.output / 'index.html').read_text()
        self.assertNotIn('id="edit-person"', html)
        self.assertNotIn('web/editor.js', html)
        self.assertNotIn('web/editor-storage.js', html)
        self.assertFalse((self.output / 'web/editor.js').exists())
        self.assertIn('web/viewer-storage.js', html)
        self.assertIn('id="download-pdf"', html)
        self.assertEqual(self.build(), (1, 1))

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


if __name__ == '__main__':
    (ROOT / 'tmp').mkdir(exist_ok=True)
    unittest.main()

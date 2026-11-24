import base64
import copy
import hashlib
import json
from pathlib import Path
import shutil
import sys
import tempfile
from types import SimpleNamespace
import unittest
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'scripts'))
from editor_server import EditorHandler, Conflict

class EditorPersistenceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.root = Path(cls.temp.name)
        shutil.copyfile(ROOT/'family-tree.schema.json', cls.root/'family-tree.schema.json')
        data = json.loads((ROOT/'examples/family-tree.example.json').read_text())
        template = copy.deepcopy(data['people'][0])
        data['people'] = []
        for number in (1, 2, 3, 6, 7, 40, 51, 53, 55):
            person = copy.deepcopy(template)
            person.update(id=f'person_{number:04d}', firstName=f'Osoba {number}',
                          birthDate=None, birthYear=None, isLiving=None,
                          Mommy=None, Daddy=None, siblings=[])
            if number in (1, 6, 53):
                person.update(Mommy='person_0003', Daddy='person_0002')
            if number in (40, 51, 55):
                person['Daddy'] = 'person_0053'
            data['people'].append(person)
        data['relationships'] = [dict(id=f'relation_{i:04d}',type='małżeństwo',personIds=ids,
                                     status=None,startYear=None,endYear=None,previousRelationshipId=None,
                                     sources=['Syntetyczne dane testowe.'])
                                 for i,ids in enumerate([['person_0002','person_0003'],['person_0006','person_0007']],1)]
        review = json.loads((ROOT/'examples/family-tree-review.example.json').read_text())
        review['summary']['totalPeople'] = len(data['people'])
        (cls.root/'family-tree.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
        (cls.root/'family-tree-review.json').write_text(json.dumps(review,ensure_ascii=False,indent=2)+'\n')
        (cls.root/'photos').mkdir()
        Image.new('RGB',(40,60),(90,130,110)).save(cls.root/'photos/test-portrait.png')
        (cls.root/'web').mkdir()
        cls.handler = object.__new__(EditorHandler)
        cls.handler.root = cls.root
        cls.handler.server = SimpleNamespace(payload=None)

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def data(self):
        return json.loads((self.root/'family-tree.json').read_text())

    def request(self, pid='person_0055'):
        data=self.data();p=copy.deepcopy(next(p for p in data['people'] if p['id']==pid))
        marriages=[copy.deepcopy(r) for r in data['relationships'] if pid in r['personIds']]
        return dict(person=p,basePerson=copy.deepcopy(p),baseMarriages=marriages,marriages=copy.deepcopy(marriages),photo=None,removePhoto=False)

    def test_save_reload_validation_photo_and_relations(self):
        order = [r['id'] for r in self.data()['relationships']]
        bio = self.request('person_0002');bio['person']['notes'] = 'Test zachowania kolejności relacji.'
        self.handler.save_person(bio)
        self.assertEqual([r['id'] for r in self.data()['relationships']], order)
        req=self.request();req['person']['firstName']='Osoba Testowa';req['person']['birthDate']='1975-02-12';req['person']['birthYear']=1975;req['person']['isLiving']=True
        req['person']['sources']=['Ręczna informacja testowa'];req['person']['notes']='Test zapisu danych.'
        photo=(self.root/'photos/test-portrait.png').read_bytes()
        req['photo']={'name':'photo.png','dataUrl':'data:image/png;base64,'+base64.b64encode(photo).decode()}
        state=self.handler.save_person(req);saved=next(p for p in self.data()['people'] if p['id']=='person_0055')
        self.assertEqual(saved['firstName'],'Osoba Testowa');self.assertEqual(saved['birthDate'],'1975-02-12');self.assertEqual((self.root/saved['photo']).read_bytes(),photo)
        self.assertTrue(list((self.root/'backups/editor').glob('*/family-tree.json')))
        self.assertIn('Osoba Testowa',(self.root/'web/family-data.js').read_text());self.assertEqual(state['sourceSha256'],hashlib.sha256((self.root/'family-tree.json').read_bytes()).hexdigest())
        before=(self.root/'family-tree.json').read_bytes()
        with self.assertRaises(Conflict):self.handler.save_person(req)
        self.assertEqual(before,(self.root/'family-tree.json').read_bytes())
        bad=self.request();bad['person']['birthDate']='1975-02-30'
        with self.assertRaises(ValueError):self.handler.save_person(bad)
        bad=self.request();bad['person']['deathYear']=2020;bad['person']['deathDate']='2020'
        with self.assertRaises(ValueError):self.handler.save_person(bad)
        bad=self.request('person_0002');bad['person']['Daddy']='person_0001'
        with self.assertRaises(ValueError):self.handler.save_person(bad)
        bad=self.request();bad['photo']={'dataUrl':'data:image/png;base64,'+base64.b64encode(b'not a photo').decode()}
        with self.assertRaises(ValueError):self.handler.save_person(bad)
        self.assertEqual(before,(self.root/'family-tree.json').read_bytes())
        req=self.request();req['person']['siblings']=['person_0040'];self.handler.save_person(req)
        other=next(p for p in self.data()['people'] if p['id']=='person_0040');self.assertIn('person_0055',other['siblings'])
        req=self.request();req['person']['siblings']=[];self.handler.save_person(req)
        other=next(p for p in self.data()['people'] if p['id']=='person_0040');self.assertNotIn('person_0055',other['siblings'])
        req=self.request();req['marriages']=[dict(id='relation_0007',type='małżeństwo',personIds=['person_0055','person_0040'],status=None,startYear=None,endYear=None,previousRelationshipId=None,sources=['Test ręcznego zapisu.'])];self.handler.save_person(req)
        self.assertEqual(len(self.data()['relationships']),3)
        req=self.request();req['marriages']=[];req['person']['Daddy']=None;state=self.handler.save_person(req)
        self.assertIn('person_0055',state['disconnectedPeople'])
        self.assertEqual(len(state['nodes']),9)
        req=self.request();req['person']['Daddy']='person_0053';self.handler.save_person(req)
        self.assertNotIn('person_0055',self.handler.server.payload['disconnectedPeople'])
        req=self.request();req['removePhoto']=True;self.handler.save_person(req)
        self.assertIsNone(next(p for p in self.data()['people'] if p['id']=='person_0055')['photo'])
        self.assertTrue((self.root/saved['photo']).exists(), 'Removing an assignment must preserve the photo file')

    def test_partial_translation_preserves_stale_fields(self):
        from tree_json import FIELDS
        req=self.request('person_0003');source={key:req['person'].get(key) for key in FIELDS}
        translations_path=self.root/'family-translations.json'
        translations=json.loads(translations_path.read_text()) if translations_path.exists() else {}
        old={'source':{'notes':'Earlier Polish text'},'values':{'notes':'Earlier English translation'}}
        translations.setdefault('en',{'language':'en','people':{},'issues':{}})['people']['person_0003']=copy.deepcopy(old)
        translations_path.write_text(json.dumps(translations))
        req['baseTranslation']=old;req['translation']={'language':'en','source':source,'values':{'title':'Translated title'}}
        state=self.handler.save_person(req);entry=state['translations']['en']['people']['person_0003']
        self.assertEqual(entry['source']['notes'],old['source']['notes'])
        self.assertEqual(entry['values']['notes'],old['values']['notes'])
        self.assertEqual(entry['values']['title'],'Translated title')

    def test_transport_failure_restores_every_snapshot(self):
        from unittest.mock import patch
        from build_html import write_payload
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);payload={'data':{'people':[]},'nodes':{},'translations':{},'version':'before'}
            write_payload(root,payload)
            before={p:p.read_bytes() for p in root.rglob('*') if p.is_file()}
            payload['version']='after';original_replace=Path.replace
            def fail_one(path,target):
                if path.name=='tree.ru.json.tmp':raise OSError('Synthetic write failure')
                return original_replace(path,target)
            with patch.object(Path,'replace',fail_one):
                with self.assertRaises(OSError):write_payload(root,payload)
            for path,content in before.items():self.assertEqual(path.read_bytes(),content)
            self.assertFalse(list(root.rglob('*.tmp')))

    def test_translation_preserves_canonical_records_and_detects_conflict(self):
        from tree_json import FIELDS
        req=self.request('person_0007')
        original=copy.deepcopy(req['person'])
        source={key:original.get(key) for key in FIELDS}
        values=copy.deepcopy(source);values['notes']='Русский тестовый перевод.'
        req['translation']={'language':'ru','source':source,'values':values}
        req['baseTranslation']=None
        state=self.handler.save_person(req)
        self.assertEqual(next(p for p in self.data()['people'] if p['id']==original['id']),original)
        self.assertEqual(state['translations']['ru']['people'][original['id']]['values']['notes'],values['notes'])
        self.assertTrue((self.root/'data/tree.ru.json').exists())
        self.assertTrue((self.root/'family-translations.json').exists())
        with self.assertRaises(Conflict):self.handler.save_person(req)

if __name__=='__main__':unittest.main()

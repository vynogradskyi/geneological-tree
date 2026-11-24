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

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'scripts'))
from editor_server import EditorHandler, Conflict

class EditorPersistenceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.root = Path(cls.temp.name)
        for name in ('family-tree.json', 'family-tree-review.json', 'family-tree.schema.json'):
            shutil.copyfile(ROOT/name, cls.root/name)
        shutil.copytree(ROOT/'photos', cls.root/'photos')
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
        bio = self.request('person_0006');bio['person']['notes'] = 'Test zachowania kolejności relacji.'
        self.handler.save_person(bio)
        self.assertEqual([r['id'] for r in self.data()['relationships']], order)
        req=self.request();req['person']['firstName']='Olga Testowa';req['person']['birthDate']='1975-02-12';req['person']['birthYear']=1975;req['person']['isLiving']=True
        req['person']['sources']=['Ręczna informacja testowa'];req['person']['notes']='Test zapisu danych.'
        photo=(ROOT/'photos/person_0051.png').read_bytes()
        req['photo']={'name':'photo.png','dataUrl':'data:image/png;base64,'+base64.b64encode(photo).decode()}
        state=self.handler.save_person(req);saved=next(p for p in self.data()['people'] if p['id']=='person_0055')
        self.assertEqual(saved['firstName'],'Olga Testowa');self.assertEqual(saved['birthDate'],'1975-02-12');self.assertEqual((self.root/saved['photo']).read_bytes(),photo)
        self.assertTrue(list((self.root/'backups/editor').glob('*/family-tree.json')))
        self.assertIn('Olga Testowa',(self.root/'web/family-data.js').read_text());self.assertEqual(state['sourceSha256'],hashlib.sha256((self.root/'family-tree.json').read_bytes()).hexdigest())
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
        self.assertEqual(len(self.data()['relationships']),7)
        req=self.request();req['marriages']=[];req['person']['Daddy']=None;state=self.handler.save_person(req)
        self.assertIn('person_0055',state['disconnectedPeople'])
        self.assertEqual(len(state['nodes']),57)
        req=self.request();req['person']['Daddy']='person_0053';self.handler.save_person(req)
        self.assertNotIn('person_0055',self.handler.server.payload['disconnectedPeople'])
        req=self.request();req['removePhoto']=True;self.handler.save_person(req)
        self.assertIsNone(next(p for p in self.data()['people'] if p['id']=='person_0055')['photo'])
        self.assertTrue((self.root/saved['photo']).exists(), 'Removing an assignment must preserve the photo file')

if __name__=='__main__':unittest.main()

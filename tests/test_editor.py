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
import family_store

class EditorPersistenceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.root = Path(cls.temp.name)
        (cls.root/family_store.INFORMATION).mkdir(parents=True)
        shutil.copyfile(family_store.schema_path(ROOT), family_store.schema_path(cls.root))
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
        family_store.information_path(cls.root).write_text(family_store.dumps(data))
        family_store.review_path(cls.root).parent.mkdir(parents=True)
        family_store.review_path(cls.root).write_text(family_store.dumps(review))
        (cls.root/family_store.PHOTOS).mkdir(parents=True)
        Image.new('RGB',(40,60),(90,130,110)).save(cls.root/family_store.PHOTOS/'test-portrait.png')
        (cls.root/'web').mkdir()
        cls.handler = object.__new__(EditorHandler)
        cls.handler.root = cls.root
        cls.handler.server = SimpleNamespace(payload=None)

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def data(self):
        return family_store.load_data(self.root)

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
        photo=(self.root/family_store.PHOTOS/'test-portrait.png').read_bytes()
        req['photo']={'name':'photo.png','dataUrl':'data:image/png;base64,'+base64.b64encode(photo).decode()}
        state=self.handler.save_person(req);saved=next(p for p in self.data()['people'] if p['id']=='person_0055')
        self.assertEqual(saved['firstName'],'Osoba Testowa');self.assertEqual(saved['birthDate'],'1975-02-12');self.assertEqual(family_store.photo_file(self.root,saved['photo']).read_bytes(),photo)
        self.assertTrue(list((self.root/family_store.BACKUPS/'editor').glob('*/family-tree.pl.json')))
        for lang in ('ru','en'):
            copy_=json.loads(family_store.information_path(self.root,lang).read_text())
            self.assertEqual(next(p for p in copy_['people'] if p['id']=='person_0055')['birthDate'],'1975-02-12','Language copies follow the Polish facts')
        # Compare names exactly: on case-insensitive file systems (macOS) 'data' would match 'Data'.
        self.assertNotIn('data',[p.name for p in self.root.iterdir()],'Site snapshots are not written into the project')
        pl_path=family_store.information_path(self.root)
        self.assertIn('Osoba Testowa',(self.root/'web/family-data.js').read_text());self.assertEqual(state['sourceSha256'],hashlib.sha256(pl_path.read_bytes()).hexdigest())
        before=pl_path.read_bytes()
        with self.assertRaises(Conflict):self.handler.save_person(req)
        self.assertEqual(before,pl_path.read_bytes())
        bad=self.request();bad['person']['birthDate']='1975-02-30'
        with self.assertRaises(ValueError):self.handler.save_person(bad)
        bad=self.request();bad['person']['deathYear']=2020;bad['person']['deathDate']='2020'
        with self.assertRaises(ValueError):self.handler.save_person(bad)
        bad=self.request('person_0002');bad['person']['Daddy']='person_0001'
        with self.assertRaises(ValueError):self.handler.save_person(bad)
        bad=self.request();bad['photo']={'dataUrl':'data:image/png;base64,'+base64.b64encode(b'not a photo').decode()}
        with self.assertRaises(ValueError):self.handler.save_person(bad)
        self.assertEqual(before,pl_path.read_bytes())
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
        self.assertTrue(family_store.photo_file(self.root,saved['photo']).exists(), 'Removing an assignment must preserve the photo file')

    def test_partial_translation_preserves_stale_fields(self):
        from family_store import FIELDS
        req=self.request('person_0003');source={key:req['person'].get(key) for key in FIELDS}
        data=self.data();translations=family_store.load_translations(self.root,data)
        old={'source':{'notes':'Earlier Polish text'},'values':{'notes':'Earlier English translation'}}
        translations['en']['people']['person_0003']=copy.deepcopy(old)
        family_store.save_information(self.root,data,translations)
        req['baseTranslation']=old;req['translation']={'language':'en','source':source,'values':{'title':'Translated title'}}
        state=self.handler.save_person(req);entry=state['translations']['en']['people']['person_0003']
        self.assertEqual(entry['source']['notes'],old['source']['notes'])
        self.assertEqual(entry['values']['notes'],old['values']['notes'])
        self.assertEqual(entry['values']['title'],'Translated title')

    def test_translation_publication_preserves_live_facts_and_media(self):
        from publish_family import build_translation_update
        from readonly_assets import DATA_FILE,MANIFEST,ASSETS
        from urllib.parse import urlsplit
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            shutil.copyfile(ROOT/'index.html',root/'index.html')
            for asset in ASSETS:
                path=root/asset;path.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(ROOT/asset,path)
            canonical={'id':'synthetic','photo':'photos/synthetic.jpg','notes':'Current Polish note'}
            payload={'data':{'people':[canonical]},'nodes':{'synthetic':{'x':1}},'thumbnails':{'synthetic':'synthetic-thumbnail'},'issues':[],'isExample':False}
            files={DATA_FILE:('window.GENEALOGY = '+json.dumps(payload)+';\n').encode(),'data/tree.json':json.dumps(payload).encode(),
                   **{f'data/tree.{lang}.json':json.dumps({'language':lang,'people':{},'issues':{}}).encode() for lang in ('pl','ru','en')},
                   'photos/synthetic.jpg':b'synthetic original photo'}
            manifest={'version':2,'files':{name:hashlib.sha256(value).hexdigest() for name,value in files.items()}}
            local={'rootPersonId':'synthetic','relationships':[],'people':[dict(canonical,notes='Earlier Polish note')]}
            translations={'en':{'people':{'synthetic':{'source':{'notes':'Earlier Polish note','title':None},'values':{'notes':'Stale English note','title':'Synthetic title'}}},'issues':{}}}
            family_store.save_information(root,local,translations)
            def fetch(url):
                name=urlsplit(url).path.lstrip('/')
                return json.dumps(manifest).encode() if name==MANIFEST else files[name]
            site,next_payload,updated,skipped=build_translation_update(root,fetch)
            self.assertEqual(next_payload['data'],payload['data']);self.assertEqual(next_payload['thumbnails'],payload['thumbnails'])
            self.assertEqual((site/'photos/synthetic.jpg').read_bytes(),files['photos/synthetic.jpg'])
            self.assertEqual((updated,skipped),(1,1))
            self.assertNotIn('notes',next_payload['translations']['en']['people']['synthetic']['values'])

    def test_transport_failure_restores_every_snapshot(self):
        from unittest.mock import patch
        from build_html import write_payload
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);payload={'data':{'people':[]},'nodes':{},'translations':{},'version':'before'}
            write_payload(root,payload)
            before={p:p.read_bytes() for p in root.rglob('*') if p.is_file()}
            payload['version']='after';original_replace=Path.replace
            def fail_one(path,target):
                if path.name=='tree.ru.json.tmp':raise OSError('Synthetic write failure')  # the last site snapshot
                return original_replace(path,target)
            with patch.object(Path,'replace',fail_one):
                with self.assertRaises(OSError):write_payload(root,payload)
            for path,content in before.items():self.assertEqual(path.read_bytes(),content)
            self.assertFalse(list(root.rglob('*.tmp')))

    def test_translation_preserves_canonical_records_and_detects_conflict(self):
        from family_store import FIELDS
        req=self.request('person_0007')
        original=copy.deepcopy(req['person'])
        source={key:original.get(key) for key in FIELDS}
        values=copy.deepcopy(source);values['notes']='Русский тестовый перевод.'
        req['translation']={'language':'ru','source':source,'values':values}
        req['baseTranslation']=None
        state=self.handler.save_person(req)
        self.assertEqual(next(p for p in self.data()['people'] if p['id']==original['id']),original)
        self.assertEqual(state['translations']['ru']['people'][original['id']]['values']['notes'],values['notes'])
        russian=json.loads(family_store.information_path(self.root,'ru').read_text())
        self.assertEqual(next(p for p in russian['people'] if p['id']==original['id'])['notes'],values['notes'])
        self.assertEqual(russian['translation']['people'][original['id']]['notes'],original['notes'])
        with self.assertRaises(Conflict):self.handler.save_person(req)

if __name__=='__main__':unittest.main()

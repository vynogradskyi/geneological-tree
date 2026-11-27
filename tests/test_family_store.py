"""TC-UNIT-STORE: Data/Information keeps three readable language files in sync (synthetic data only)."""
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import family_store
from family_store import FIELDS


def person(pid, **values):
    record = {'id': pid, 'firstName': 'Anna', 'lastName': 'Testowa', 'patronymic': None, 'maidenName': None,
              'formerLastNames': [], 'birthYear': 1950, 'deathYear': None, 'isLiving': None,
              'birthPlace': {'city': 'Kraków', 'country': 'Polska', 'region': None}, 'Mommy': None, 'Daddy': None,
              'siblings': [], 'photo': None, 'sources': ['Syntetyczne dane.'], 'notes': 'Notatka po polsku.',
              'birthDate': '1950', 'deathDate': None, 'deathPlace': {'city': None, 'country': None, 'region': None}}
    record.update(values)
    return record


class FamilyStoreTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / family_store.INFORMATION).mkdir(parents=True)
        family_store.schema_path(self.root).write_text(family_store.schema_path(ROOT).read_text())
        self.data = {'$schema': './family-tree.schema.json', 'version': '1.2', 'language': 'pl', 'rootPersonId': 'person_0001',
                     'people': [person('person_0001'), person('person_0002', firstName='Jan', notes=None)], 'relationships': []}
        self.translations = {'ru': {'language': 'ru', 'issues': {'Q01': {'source': 'Pytanie?', 'value': 'Вопрос?'}},
                                    'people': {'person_0001': {'source': {'notes': 'Notatka po polsku.', 'firstName': 'Anna'},
                                                               'values': {'notes': 'Заметка по-русски.', 'firstName': 'Анна'}}}},
                             'en': {'language': 'en', 'people': {}, 'issues': {}}}
        family_store.save_information(self.root, self.data, self.translations)

    def tearDown(self):
        self.temp.cleanup()

    def document(self, lang):
        return json.loads(family_store.information_path(self.root, lang).read_text())

    def write(self, lang, document):
        family_store.information_path(self.root, lang).write_text(family_store.dumps(document))

    def test_language_files_are_complete_and_round_trip(self):
        russian, english = self.document('ru'), self.document('en')
        for document in (russian, english):
            self.assertEqual([p['id'] for p in document['people']], ['person_0001', 'person_0002'])
            for copy_, original in zip(document['people'], self.data['people']):
                for key in original.keys() - set(FIELDS):
                    self.assertEqual(copy_[key], original[key], 'Facts are shared by every language file')
        self.assertEqual(russian['people'][0]['firstName'], 'Анна')
        self.assertEqual(russian['people'][1]['firstName'], 'Jan', 'Untranslated text keeps the Polish value')
        self.assertEqual(english['people'][0]['notes'], 'Notatka po polsku.')
        self.assertEqual(family_store.load_translations(self.root), self.translations)

    def test_hand_edit_of_language_file_becomes_translation(self):
        russian = self.document('ru')
        russian['people'][1]['notes'] = 'Новая заметка.'
        self.write('ru', russian)
        entry = family_store.load_translations(self.root)['ru']['people']['person_0002']
        self.assertEqual(entry, {'source': {'notes': None}, 'values': {'notes': 'Новая заметка.'}})

    def test_facts_changed_in_language_file_are_rejected(self):
        russian = self.document('ru')
        russian['people'][0]['isLiving'] = True
        self.write('ru', russian)
        with self.assertRaisesRegex(ValueError, 'family-tree.ru.json.*isLiving'):
            family_store.load_translations(self.root)
        russian = self.document('ru')
        russian['people'][0]['isLiving'] = None
        russian['language'] = 'en'
        self.write('ru', russian)
        with self.assertRaisesRegex(ValueError, 'language'):
            family_store.load_translations(self.root)

    def test_polish_edit_by_hand_keeps_translations_and_marks_them_outdated(self):
        changed = copy.deepcopy(self.data)
        changed['people'][0]['notes'] = 'Poprawiona notatka.'
        changed['people'][0]['birthYear'] = 1949
        changed['people'][0]['birthDate'] = '1949'
        changed['people'].append(person('person_0003'))
        family_store.information_path(self.root).write_text(family_store.dumps(changed))
        entry = family_store.load_translations(self.root, changed)['ru']['people']['person_0001']
        self.assertEqual(entry['source']['notes'], 'Notatka po polsku.', 'The old source shows the translation is outdated')
        self.assertNotIn('person_0003', family_store.load_translations(self.root, changed)['ru']['people'])
        family_store.save_information(self.root, changed, family_store.load_translations(self.root, changed))
        self.assertEqual(self.document('ru')['people'][0]['birthYear'], 1949)
        self.assertEqual(len(self.document('en')['people']), 3)

    def test_missing_language_files_are_empty_and_photo_paths_stay_inside_data(self):
        family_store.information_path(self.root, 'en').unlink()
        self.assertEqual(family_store.load_translations(self.root)['en'], {'language': 'en', 'people': {}, 'issues': {}})
        self.assertEqual(family_store.photo_file(self.root, 'photos/a.png'), self.root / 'Data/Photos/a.png')
        for bad in ('../a.png', 'photos/../a.png', 'photos/x/a.png', '/photos/a.png', 'other/a.png'):
            with self.subTest(path=bad), self.assertRaises(ValueError):
                family_store.photo_file(self.root, bad)


if __name__ == '__main__':
    unittest.main()

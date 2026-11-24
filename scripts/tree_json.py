"""JSON transport and language overlays. Personal translations remain outside Git."""
import copy
import hashlib
import json
from pathlib import Path

LANGUAGES=('pl','ru','en')
JSON_FILES={'data/tree.json',*(f'data/tree.{lang}.json' for lang in LANGUAGES)}
FIELDS=('firstName','lastName','maidenName','patronymic','formerLastNames','title','occupation',
        'notes','deathCircumstances','birthDateNote','deathDateNote','birthPlace','deathPlace')


def load_translations(root):
    path=Path(root)/'family-translations.json'
    return json.loads(path.read_text()) if path.exists() else {}


def language_payloads(payload):
    people=payload['data']['people']
    result={}
    for lang in LANGUAGES:
        localized=copy.deepcopy(payload.get('translations',{}).get(lang,{}))
        localized['language']=lang
        localized.setdefault('people',{})
        localized.setdefault('issues',{})
        if lang=='pl':
            localized['people']={p['id']:{'source':{k:p.get(k) for k in FIELDS},'values':{k:p.get(k) for k in FIELDS}} for p in people}
        result[lang]=localized
    return result


def write_json_payload(root,payload):
    root=Path(root);(root/'data').mkdir(parents=True,exist_ok=True)
    state={key:value for key,value in payload.items() if key!='translations'}
    (root/'data/tree.json').write_text(json.dumps(state,ensure_ascii=False,separators=(',',':'))+'\n')
    for lang,localized in language_payloads(payload).items():
        (root/f'data/tree.{lang}.json').write_text(json.dumps(localized,ensure_ascii=False,separators=(',',':'))+'\n')


def read_json_payload(root):
    root=Path(root);payload=json.loads((root/'data/tree.json').read_text())
    payload['translations']={lang:json.loads((root/f'data/tree.{lang}.json').read_text()) for lang in LANGUAGES}
    return payload

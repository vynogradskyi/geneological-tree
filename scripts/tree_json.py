"""Site JSON snapshots (data/tree*.json) and language overlays.

These files are the published transport format; the local records live in Data/ (family_store.py).
"""
import copy
import hashlib
import json
from pathlib import Path

from family_store import FIELDS, LANGUAGES, TRANSLATED

JSON_FILES={'data/tree.json',*(f'data/tree.{lang}.json' for lang in LANGUAGES)}


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


def read_json_payload(root):
    root=Path(root);payload=json.loads((root/'data/tree.json').read_text())
    payload['translations']={lang:json.loads((root/f'data/tree.{lang}.json').read_text()) for lang in LANGUAGES}
    return payload


def translation_digest(translations):
    return hashlib.sha256(json.dumps(translations,ensure_ascii=False,sort_keys=True).encode()).hexdigest()


def merge_translation(translations,person_id,entry):
    values=entry['values']
    if entry.get('language') not in TRANSLATED or not isinstance(values,dict) or not set(values)<=set(FIELDS):
        raise ValueError('Nieprawidłowe tłumaczenie.')
    for key,value in values.items():
        valid=(value is None or isinstance(value,str))
        if key=='formerLastNames':valid=isinstance(value,list) and all(isinstance(v,str) and v.strip() for v in value)
        if key in ('birthPlace','deathPlace'):valid=isinstance(value,dict) and set(value)=={'city','region','country'} and all(v is None or isinstance(v,str) for v in value.values())
        if not valid:raise ValueError('Nieprawidłowe tłumaczenie.')
    bucket=translations.setdefault(entry['language'],{'language':entry['language'],'people':{},'issues':{}})
    previous=bucket['people'].setdefault(person_id,{'source':{},'values':{}})
    for key,value in values.items():previous['source'][key]=copy.deepcopy(entry['source'][key]);previous['values'][key]=copy.deepcopy(value)

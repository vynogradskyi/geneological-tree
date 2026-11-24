"""Build the file:// fallback from the same public UI JSON dictionaries."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]


def build(root=ROOT):
    dictionaries={lang:json.loads((root/f'locales/{lang}.json').read_text()) for lang in ('pl','ru','en')}
    if any(set(dictionaries[lang])!=set(dictionaries['pl']) for lang in dictionaries):
        raise ValueError('Locale keys differ')
    content='window.GENEALOGY_LOCALES = '+json.dumps(dictionaries,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')+';\n'
    (root/'web/locale-bundle.js').write_text(content)


if __name__=='__main__':
    build()

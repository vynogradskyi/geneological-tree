"""Explicit family/translation publication. Real files never enter Git."""
import argparse
import copy
from pathlib import Path
import shutil
import subprocess

from build_readonly import build_readonly
from build_hosted import build_hosted, download
from build_html import write_payload
from readonly_assets import write_manifest
from family_store import TRANSLATED, load_translations
from tree_json import read_json_payload, merge_translation, translation_digest

ROOT = Path(__file__).resolve().parents[1]
SOURCE = 'https://familytree-9505c.web.app'


def build_translation_update(root=ROOT, fetch=download):
    """Overlay only translations whose Polish source still matches the live tree."""
    root=Path(root);site=root/'output/firebase/translations-candidate'
    build_hosted(SOURCE,site,root,fetch)
    payload=read_json_payload(site);before=copy.deepcopy(payload['data'])
    people={p['id']:p for p in payload['data']['people']}
    issues={issue['id']:issue.get('question',issue.get('topic')) for issue in payload.get('issues',[])}
    updated=0;skipped=0
    for lang,local in load_translations(root).items():
        if lang not in TRANSLATED:continue
        for pid,entry in local.get('people',{}).items():
            if pid not in people:skipped+=1;continue
            values={key:value for key,value in entry['values'].items() if key in entry['source'] and entry['source'][key]==people[pid].get(key)}
            skipped+=len(entry['values'])-len(values)
            if values:
                merge_translation(payload['translations'],pid,{'language':lang,'source':entry['source'],'values':values})
                updated+=len(values)
        bucket=payload['translations'].setdefault(lang,{'language':lang,'people':{},'issues':{}})
        for qid,entry in local.get('issues',{}).items():
            if qid in issues and entry.get('source')==issues[qid]:bucket['issues'][qid]=copy.deepcopy(entry);updated+=1
            else:skipped+=1
    if not updated:raise ValueError('No matching local translations. Nothing will be published.')
    payload['translationSha256']=translation_digest(payload['translations'])
    assert payload['data']==before
    write_payload(site,payload)
    write_manifest(site,{p['photo'] for p in people.values() if p.get('photo')})
    return site,payload,updated,skipped


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--build-only',action='store_true')
    parser.add_argument('--translations-only',action='store_true',help='Use verified live facts/photos; overlay only matching local text translations.')
    args=parser.parse_args()
    if args.translations_only:
        site,payload,updated,skipped=build_translation_update()
        print(f'Prepared {updated} translated fields/questions; {skipped} stale or unknown entries skipped. Live facts/photos preserved.',flush=True)
    else:
        site,archive,payload=build_readonly(ROOT)
    if payload.get('isExample'):raise ValueError('Refusing to publish synthetic example data as the family site')
    target=ROOT/'output/firebase/site'
    if target.exists():shutil.rmtree(target)
    target.parent.mkdir(parents=True,exist_ok=True);shutil.copytree(site,target)
    print(f"Prepared {len(payload['nodes'])} people, {len(payload['thumbnails'])} portraits.",flush=True)
    if not args.build_only:
        subprocess.run(['firebase','deploy','--only','hosting','--project','familytree-9505c'],cwd=ROOT,check=True)


if __name__=='__main__':
    main()

from pathlib import Path
from collections import deque, defaultdict
import json
import subprocess
from card_metrics import METRICS

def create_layout(data, output_dir):
    TMP = Path(output_dir)
    TMP.mkdir(parents=True, exist_ok=True)
    people = {p['id']: p for p in data['people']}
    links = {pid: [] for pid in people}
    for p in people.values():
        for field in ('Mommy', 'Daddy'):
            if p[field]:
                links[p['id']].append((p[field], 1)); links[p[field]].append((p['id'], -1))
        for ref in p['siblings']:
            links[p['id']].append((ref, 0))
    for r in data['relationships']:
        a,b=r['personIds'];links[a].append((b,0));links[b].append((a,0))
    rank = {data['rootPersonId']: 0}
    queue = deque([data['rootPersonId']])
    while queue:
        a = queue.popleft()
        for b, delta in links[a]:
            if b not in rank:
                rank[b] = rank[a] + delta;queue.append(b)
            else:
                assert rank[b] == rank[a] + delta
    for start in people:
        if start in rank:
            continue
        rank[start] = 0
        queue = deque([start])
        while queue:
            a = queue.popleft()
            for b, delta in links[a]:
                if b not in rank:
                    rank[b] = rank[a] + delta
                    queue.append(b)
                else:
                    assert rank[b] == rank[a] + delta
    MAX_RANK=max(rank.values())
    MIN_RANK=min(rank.values())
    GENERATION_COUNT=MAX_RANK-MIN_RANK+1

    def ancestors(pid):
        result = {pid}
        for field in ('Mommy', 'Daddy'):
            if people[pid][field]: result |= ancestors(people[pid][field])
        return result
    root = people[data['rootPersonId']]
    paternal = ancestors(root['Daddy']) if root['Daddy'] else set()
    maternal = ancestors(root['Mommy']) if root['Mommy'] else set()
    direct = ancestors(data['rootPersonId'])
    branch = {pid: None for pid in people}
    for pid in paternal: branch[pid]='father'
    for pid in maternal: branch[pid]='mother'
    branch[data['rootPersonId']] = 'root'
    queue = deque(pid for pid in people if branch[pid] in ('father','mother'))
    while queue:
        pid=queue.popleft()
        for ref,_ in links[pid]:
            if branch[ref] is None:
                branch[ref] = branch[pid];queue.append(ref)
    for pid in branch:
        if branch[pid] is None:
            branch[pid] = 'other'

    W,H = 150,234
    rank_items=defaultdict(list)
    families=defaultdict(list)
    for p in people.values():
        if p['Daddy'] or p['Mommy']:
            families[(p['Daddy'],p['Mommy'])].append(p['id'])
    dot = ['digraph tree {', 'graph [rankdir=TB, splines=spline, nodesep=0.21, ranksep=0.47, outputorder=edgesfirst, bgcolor="transparent", newrank=true];', f'node [shape=box, fixedsize=true, label="", width={METRICS["width"]/72:.8f}, height={METRICS["height"]/72:.8f}];', 'edge [arrowhead=none, penwidth=1.2];']
    for pid in sorted(people, key=lambda i:(branch[i]!='father',-rank[i],i)):
        dot.append(f'"{pid}";');rank_items[2*rank[pid]].append(pid)
    edge_kinds={}
    pair_groups=defaultdict(list)
    family_branch={}
    def edge(a,b,kind,label=None,extra=''):
        attrs = ['arrowhead=none',f'kind="{kind}"']
        if kind=='sibling': attrs += ['constraint=false','style=dashed','color="#A1ADB7"']
        if kind=='marriage': attrs += ['constraint=false','style=dotted','color="#89779B"','fontname="DejaVu Sans"','fontsize=11']
        if kind=='placeholder': attrs += ['style=dashed','color="#AF8351"']
        if label:attrs.append('label='+json.dumps(label,ensure_ascii=False))
        if extra:attrs.append(extra)
        dot.append(f'"{a}" -> "{b}" [{",".join(attrs)}];')
    for index, ((dad,mom), children) in enumerate(families.items()):
        junction=f'family_{index:02d}'
        parent = dad or mom
        sides={branch[p] for p in (dad,mom) if p}
        family_branch[junction]=next(iter(sides)) if len(sides)==1 else None
        dot.append(f'"{junction}" [shape=point,width=0.045,height=0.045,label=""];')
        rank_items[2*rank[parent]-1].append(junction)
        for p in (dad,mom):
            if p: edge(p,junction,'parent',extra='tailport=s')
        for child in children:edge(junction,child,'parent',extra='headport=n')
        if dad and mom:
            if branch[dad]==branch[mom]:
                pair_groups[branch[dad]].append(f'subgraph cluster_pair_{index:02d} {{style=invis; margin=5; "{dad}"; "{mom}";}}')
            dot.append(f'"{dad}" -> "{mom}" [style=invis,weight=100];')
    seen=set()
    for p in people.values():
        for sibling in p['siblings']:
            pair=tuple(sorted([p['id'],sibling]))
            if pair in seen:continue
            seen.add(pair)
            shared = ({p['Mommy'],p['Daddy']}-{None}) & ({people[sibling]['Mommy'],people[sibling]['Daddy']}-{None})
            if not shared:edge(*pair,'sibling')
    for r in data['relationships']:
        label='rozwód' if r['status']=='rozwiedzeni' else ('późniejsze małżeństwo' if r['previousRelationshipId'] else 'małżeństwo')
        edge(*r['personIds'],'marriage',label)
    # Dwie gałęzie zachowują wspólne, nieprzeplatające się obszary.
    for side in ('father','mother'):
        dot.append(f'subgraph cluster_branch_{side} {{style=invis; margin=10;')
        for pid in people:
            if branch[pid]==side:dot.append(f'"{pid}";')
        for junction,group_side in family_branch.items():
            if group_side==side:dot.append(f'"{junction}";')
        dot.extend(pair_groups[side])
        if side == 'father':
            # Keep each side branch in its own vertical band. These clusters
            # control presentation only; the parent references remain the source.
            for name, members in (
                ('natalja', {'person_0026','person_0027','person_0028','person_0029'}),
                ('siergiej', {'person_0040','person_0041'}),
            ):
                if not all(branch.get(pid) == side for pid in members):
                    continue
                dot.append(f'subgraph cluster_descendants_{name} {{style=invis; margin=10;')
                dot.extend(f'"{pid}";' for pid in sorted(members))
                for index, ((dad,mom), children) in enumerate(families.items()):
                    parents = {p for p in (dad,mom) if p}
                    if parents and parents <= members and set(children) <= members:
                        dot.append(f'"family_{index:02d}";')
                dot.append('}')
        dot.append('}')
    # Boczne rodzeństwo pozostaje obok odpowiedniej gałęzi.
    for a,b in [('person_0013','person_0014'),('person_0014','person_0012'),('person_0017','person_0022'),('person_0022','person_0023'),('person_0049','person_0054')]:
        if a in people and b in people and rank[a] == rank[b]:
            dot.append(f'"{a}" -> "{b}" [style=invis,weight=50];')
    # Porządek prezentacji nie jest dodatkową więzią genealogiczną.
    if 'person_0002' in people and 'person_0003' in people and rank['person_0002'] == rank['person_0003']:
        dot.append('"person_0002" -> "person_0003" [style=invis,weight=100];')
    for a,b in [('person_0041','person_0027'),('person_0027','person_0028'),('person_0028','person_0002')]:
        if a in people and b in people and rank[a] == rank[b]:
            dot.append(f'"{a}" -> "{b}" [style=invis,weight=100];')
    for level in range(2*MAX_RANK,2*MIN_RANK-1,-1):
        anchor=f'anchor_{level}'
        dot.append(f'"{anchor}" [shape=point,width=0,height=0,style=invis];')
        dot.append('{rank=same;'+ ';'.join('"'+x+'"' for x in [anchor,*rank_items[level]])+';}')
        if level<2*MAX_RANK:dot.append(f'"anchor_{level+1}" -> "{anchor}" [style=invis,weight=100];')
    dot.append('}')
    (TMP / 'family-tree.dot').write_text('\n'.join(dot))
    js = '''const fs=require('node:fs');
    const {instance}=require(process.argv[4]);
    (async()=>{const viz=await instance();const source=fs.readFileSync(process.argv[2],'utf8');fs.writeFileSync(process.argv[3],JSON.stringify(viz.renderJSON(source),null,2));})();
    '''
    (TMP / 'layout.cjs').write_text(js)
    viz = Path(__file__).resolve().parents[1] / 'web/vendor/viz-global.js'
    subprocess.run(['node',str(TMP/'layout.cjs'),str(TMP/'family-tree.dot'),str(TMP/'layout.json'),str(viz)],check=True)
    graph=json.loads((TMP/'layout.json').read_text())
    objects={obj['name']:obj for obj in graph['objects'] if 'pos' in obj}
    id_objects={obj['_gvid']:obj for obj in graph['objects']}

    return graph, rank, branch, direct, GENERATION_COUNT

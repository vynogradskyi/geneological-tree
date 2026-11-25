/* Deterministic family areas. No names, real-person IDs or inferred marriage status. */
window.GenealogyFamilyLayout = (() => {
  const VERSION=3;
  // x(child) = mean(x(parents)) for singleton families. Orthogonal projection
  // keeps these equations exact while Hildreth's dual updates enforce row gaps.
  // This minimizes squared horizontal positions for the selected family order.
  function alignChildren(layout, people, width, gap, padding) {
    const ids = Object.keys(layout.nodes).sort();
    const index = new Map(ids.map((id, i) => [id, i]));
    const count = ids.length;
    const vector = () => Array(count).fill(0);
    const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
    const basis = [], families = new Map();
    for (const person of people.values()) if (person.Mommy || person.Daddy) {
      const key = JSON.stringify([person.Mommy, person.Daddy]);
      if (!families.has(key)) families.set(key, []);
      families.get(key).push(person);
    }
    for (const children of families.values()) if (children.length === 1) {
      const child = children[0], parents = [child.Mommy, child.Daddy].filter(Boolean);
      const normal = vector();
      normal[index.get(child.id)] = 1;
      for (const parent of parents) normal[index.get(parent)] -= 1 / parents.length;
      // Reorthogonalization avoids drift in long, uneven ancestor chains.
      for (let pass = 0; pass < 2; pass++) for (const axis of basis) {
        const amount = dot(normal, axis);
        for (let i = 0; i < count; i++) normal[i] -= amount * axis[i];
      }
      const length = Math.sqrt(dot(normal, normal));
      if (length > 1e-9) basis.push(normal.map(value => value / length));
    }
    function project(input) {
      const result = input.slice();
      for (const axis of basis) {
        const amount = dot(result, axis);
        for (let i = 0; i < count; i++) result[i] -= amount * axis[i];
      }
      return result;
    }
    const coordinates = project(ids.map(id => layout.nodes[id].x));
    const policy = layout.layoutPolicy;
    const units = new Map(ids.map(id => [id, policy.pairs.find(pair => pair.includes(id)) || [id]]));
    const trunks = new Map(ids.map(id => [id, policy.areas[policy.personAreas[id]].path.match(/^root([01]*)/)[1]]));
    function branchBefore(a, b) {
      const left = trunks.get(a), right = trunks.get(b);
      let i = 0;
      while (i < Math.min(left.length, right.length) && left[i] === right[i]) i++;
      return i < Math.min(left.length, right.length) && left[i] === '0';
    }
    function mustPrecede(a, b) {
      return a.some(id => b.some(other => branchBefore(id, other))) ||
        [...people.values()].some(person => a.includes(person.Mommy) && b.includes(person.Daddy));
    }
    function blocks(row) {
      const pending = new Set(row), result = [];
      for (const id of row) if (pending.has(id)) {
        const members = units.get(id).filter(other => pending.has(other));
        members.sort((a, b) => row.indexOf(a) - row.indexOf(b));
        for (const member of members) pending.delete(member);
        result.push(members);
      }
      return result;
    }
    // Ancestor regions and mother/father roles are hard precedence constraints.
    // A prefix is not a competing branch: descendants can share an ancestor axis.
    let rows = {};
    for (const [rank, row] of Object.entries(policy.rowOrder)) {
      const groups = blocks(row), sorted = [];
      const predecessors = new Map(groups.map(group => [group, groups.filter(other => other !== group && mustPrecede(other, group))]));
      const mean = group => group.reduce((sum, id) => sum + coordinates[index.get(id)], 0) / group.length;
      while (sorted.length < groups.length) {
        const ready = groups.filter(group => !sorted.includes(group) && predecessors.get(group).every(other => sorted.includes(other)));
        if (!ready.length) throw Error('Nie można zachować kolejności rodzin. Sprawdź powiązania.');
        ready.sort((a, b) => mean(a) - mean(b) || row.indexOf(a[0]) - row.indexOf(b[0]));
        sorted.push(ready[0]);
      }
      rows[rank] = sorted.flat();
    }
    let maxViolation = Infinity;
    const seen = new Set([JSON.stringify(rows)]);
    // Bounded retries can exchange unconstrained neighboring family blocks.
    // Confirmed couples, branch order and parental roles never change sides.
    for (let attempt = 0; attempt < 100; attempt++) {
      const clauses = [];
      for (const row of Object.values(rows)) for (let j = 1; j < row.length; j++) {
        const a = index.get(row[j - 1]), b = index.get(row[j]), difference = vector();
        difference[b] = 1; difference[a] = -1;
        const normal = project(difference);
        clauses.push({a, b, normal, norm: dot(normal, normal), lambda: 0});
      }
      coordinates.fill(0);
      for (let iteration = 0; iteration < 5000; iteration++) {
        let step = 0;
        for (const clause of clauses) {
          if (clause.norm < 1e-12) continue;
          const {a, b, normal, norm} = clause;
          const next = Math.max(0, clause.lambda + (width + gap - coordinates[b] + coordinates[a]) / norm);
          const delta = next - clause.lambda;
          clause.lambda = next;
          step = Math.max(step, Math.abs(delta));
          if (delta) for (let i = 0; i < count; i++) coordinates[i] += delta * normal[i];
        }
        maxViolation = Math.max(0, ...clauses.map(({a, b}) => width + gap - coordinates[b] + coordinates[a]));
        if (maxViolation < 1e-7 && step < 1e-7) break;
      }
      if (maxViolation < 1e-5) break;
      const movable = clauses.filter(({a, b}) => {
        const left = units.get(ids[a]), right = units.get(ids[b]);
        return !left.some(id => right.includes(id)) && !mustPrecede(left, right);
      }).sort((a, b) => b.lambda - a.lambda);
      let exchanged = false;
      for (const clause of movable) {
        const rank = layout.ranks[ids[clause.a]], row = rows[rank];
        const left = blocks(row).find(group => group.includes(ids[clause.a]));
        const right = blocks(row).find(group => group.includes(ids[clause.b]));
        const next = row.slice(), start = row.indexOf(left[0]);
        next.splice(start, left.length + right.length, ...right, ...left);
        const candidate = {...rows, [rank]: next}, signature = JSON.stringify(candidate);
        if (seen.has(signature)) continue;
        seen.add(signature); rows = candidate; exchanged = true; break;
      }
      if (!exchanged) break;
    }
    if (maxViolation > 1e-5) throw Error('Nie można wyrównać rodzin bez nakładania kart. Sprawdź powiązania.');
    // Uniform expansion absorbs floating point gap error and preserves all axes.
    for (let i = 0; i < count; i++) coordinates[i] *= 1 + 1e-7;
    const offset = padding - Math.min(...coordinates);
    for (let i = 0; i < count; i++) layout.nodes[ids[i]].x = coordinates[i] + offset;
    policy.rowOrder = rows;
    for (const area of Object.values(policy.areas)) {
      const members = ids.filter(id => {
        const path = policy.areas[policy.personAreas[id]].path;
        return path === area.path || ['0', '1', '/'].some(suffix => path.startsWith(area.path + suffix));
      });
      area.left = Math.min(...members.map(id => layout.nodes[id].x));
      area.right = Math.max(...members.map(id => layout.nodes[id].x + width));
    }
    layout.width = Math.max(...coordinates) + offset + width + padding;
  }
  function create(data){
    const {width:W,height:H,gap:GAP}=window.GenealogyCardMetrics,LEVEL=H+108,PAD=64;
    const P=new Map(data.people.map(p=>[p.id,p]));
    if(P.size!==data.people.length||!P.has(data.rootPersonId))throw Error('Nieprawidłowe identyfikatory osób.');
    const links=new Map([...P.keys()].map(id=>[id,new Map()])),siblings=new Map([...P.keys()].map(id=>[id,new Set()])),children=new Map([...P.keys()].map(id=>[id,[]]));
    const relations=new Map(),current=new Map([...P.keys()].map(id=>[id,[]]));
    const key=(a,b)=>[a,b].sort().join('|');
    function connect(a,b,delta,type){if(!P.has(a)||!P.has(b)||a===b)throw Error('Nieprawidłowe powiązania rodzinne.');links.get(a).set(b,{delta,type});links.get(b).set(a,{delta:-delta,type});}
    for(const p of P.values())for(const field of ['Mommy','Daddy'])if(p[field]){connect(p.id,p[field],1,'parent');children.get(p[field]).push(p.id);}
    function sibling(a,b){siblings.get(a).add(b);siblings.get(b).add(a);connect(a,b,0,'sibling');}
    for(const p of P.values())for(const id of p.siblings||[])sibling(p.id,id);
    for(const ids of children.values())for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++)sibling(ids[i],ids[j]);
    for(const r of data.relationships){const[a,b]=r.personIds;connect(a,b,0,'spouse');relations.set(key(a,b),r);if(r.status==='trwa'){current.get(a).push(b);current.get(b).push(a);}}
    if([...current.values()].some(ids=>ids.length>1))throw Error('Więcej niż jedno potwierdzone aktualne małżeństwo. Sprawdź statusy.');
    const ranks={},connected=new Set();
    function rankComponent(start,main=false){ranks[start]=0;const queue=[start];for(let i=0;i<queue.length;i++){const id=queue[i];if(main)connected.add(id);for(const[next,edge]of links.get(id)){const rank=ranks[id]+edge.delta;if(ranks[next]===undefined){ranks[next]=rank;queue.push(next);}else if(ranks[next]!==rank)throw Error('Powiązania wskazują sprzeczne pokolenia. Sprawdź rodziców i rodzeństwo.');}}}
    rankComponent(data.rootPersonId,true);for(const id of [...P.keys()].sort())if(ranks[id]===undefined)rankComponent(id);
    const min=Math.min(...Object.values(ranks)),max=Math.max(...Object.values(ranks));
    const coords={},areas={},personAreas={},warnings=[],direct=new Set();
    let areaNumber=0;
    const ancestorSet=(start,allowed)=>{const found=new Set(),visit=id=>{if(!id||!allowed.has(id)||found.has(id))return;found.add(id);const p=P.get(id);visit(p.Mommy);visit(p.Daddy);};visit(start);return found;};
    for(const id of ancestorSet(data.rootPersonId,new Set(P.keys())))direct.add(id);
    function category(owner,id){if(current.get(owner).includes(id))return 0;if(siblings.get(owner).has(id))return 1;const r=relations.get(key(owner,id));if(r)return r.status==='rozwiedzeni'||r.status==='zakończone'?4:3;return 2;}
    function pack(focus,members,orientation,path){
      const backbone=ancestorSet(focus,members),paths=new Map(),parentTree=new Map();
      function assign(id,address){if(!id||!backbone.has(id))return;if(paths.has(id)){warnings.push('shared-ancestor');return;}paths.set(id,address);const p=P.get(id),pair={};for(const[field,bit]of [['Mommy','0'],['Daddy','1']])if(p[field]&&backbone.has(p[field])&&!paths.has(p[field])){pair[field]=p[field];assign(p[field],address+bit);}parentTree.set(id,pair);}
      assign(focus,'');
      // Nearest known relative owns a lateral family. A sibling link wins a tie with an unconfirmed spouse.
      const owners=new Map(),queue=[];
      for(const owner of [...backbone].sort())for(const[id]of links.get(owner))if(members.has(id)&&!backbone.has(id))queue.push({id,owner,seed:id,distance:1,priority:category(owner,id)});
      const compare=(a,b)=>a.distance-b.distance||a.priority-b.priority||paths.get(a.owner).length-paths.get(b.owner).length||a.owner.localeCompare(b.owner)||a.seed.localeCompare(b.seed);
      while(queue.length){queue.sort(compare);const item=queue.shift(),old=owners.get(item.id);if(old&&compare(old,item)<=0)continue;owners.set(item.id,item);for(const[id]of links.get(item.id))if(members.has(id)&&!backbone.has(id))queue.push({...item,id,distance:item.distance+1});}
      const groups=new Map();
      for(const[id,item]of owners){const groupKey=item.owner+'|'+item.seed;if(!groups.has(groupKey))groups.set(groupKey,{owner:item.owner,seed:item.seed,priority:category(item.owner,item.seed),members:new Set()});groups.get(groupKey).members.add(id);}
      // Current partners are inseparable even when both are separately connected to the backbone.
      let merged=true;while(merged){merged=false;const all=[...groups.entries()];outer:for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){const[aKey,a]=all[i],[bKey,b]=all[j];if(a.owner!==b.owner)continue;if([...a.members].some(id=>current.get(id).some(other=>b.members.has(other)))){for(const id of b.members)a.members.add(id);groups.delete(bKey);merged=true;break outer;}}}
      const byOwner=new Map([...backbone].map(id=>[id,[]]));
      for(const group of groups.values())byOwner.get(group.owner).push(group);
      function build(id,side,address){
        const areaId='area_'+areaNumber++,p=P.get(id),parents=parentTree.get(id)||{};
        const mother=parents.Mommy?build(parents.Mommy,'left',address+'0'):null,father=parents.Daddy?build(parents.Daddy,'right',address+'1'):null;
        const attachments=byOwner.get(id).sort((a,b)=>a.priority-b.priority||a.seed.localeCompare(b.seed));
        const local=attachments.map(group=>({...group})),self={self:id,width:W,members:new Set([id])};
        const active=local.filter(unit=>unit.priority===0),siblingsNear=local.filter(unit=>unit.priority===1),far=local.filter(unit=>unit.priority>1);
        let order=side==='left'?[...far.slice().reverse(),...siblingsNear.slice().reverse(),self,...active]:[...active,self,...siblingsNear,...far];
        // Known mother/father roles order the two units, never an assumed gender or surname.
        const preceding=new Map(order.map(unit=>[unit,new Set()]));
        for(const child of P.values())if(child.Mommy&&child.Daddy){const motherUnit=order.find(unit=>unit.members.has(child.Mommy)),fatherUnit=order.find(unit=>unit.members.has(child.Daddy));if(motherUnit&&fatherUnit&&motherUnit!==fatherUnit)preceding.get(fatherUnit).add(motherUnit);}
        const sorted=[];while(sorted.length<order.length){const next=order.find(unit=>!sorted.includes(unit)&&[...preceding.get(unit)].every(before=>sorted.includes(before)));if(!next)throw Error('Nie można zachować kolejności rodziców. Sprawdź powiązania.');sorted.push(next);}order=sorted;
        const selfIndex=order.indexOf(self);
        for(let i=0;i<order.length;i++)if(!order[i].self)order[i].unit=pack(order[i].seed,order[i].members,i<selfIndex?'left':'right',address+'/side/'+order[i].seed);
        const ancestorParts=[mother,father].filter(Boolean);
        const compactRoot=side==='center'&&order.length===1&&mother?.inner&&father?.inner;
        const parts=compactRoot?[mother,father]:side==='left'?[...ancestorParts,...order]:side==='right'?[...order,...ancestorParts]:[...(mother?[mother]:[]),...order,...(father?[father]:[])];
        const width=parts.reduce((sum,part)=>sum+(part.self?W:part.unit?.width||part.width),0)+Math.max(0,parts.length-1)*GAP;
        return {width,inner:side==='left'?order.at(-1)?.self===id:side==='right'?order[0]?.self===id:false,place(left){
          areas[areaId]={left,right:left+width,path:address,focus:id};
          let x=left;
          for(const part of parts){if(part.self){coords[id]=x;personAreas[id]=areaId;x+=W+GAP;}else{const unit=part.unit||part;unit.place(x);x+=unit.width+GAP;}}
          if(compactRoot){coords[id]=(coords[parents.Mommy]+coords[parents.Daddy])/2;personAreas[id]=areaId;}
        }};
      }

      const tree=build(focus,orientation,path);
      // Disconnected members retain their own labelled area rather than being inserted into another family.
      const used=new Set([...backbone,...owners.keys()]),remaining=[...members].filter(id=>!used.has(id)).sort(),extra=[];
      while(remaining.length){const start=remaining[0],component=new Set(),todo=[start];while(todo.length){const id=todo.shift();if(component.has(id))continue;component.add(id);for(const[next]of links.get(id))if(remaining.includes(next)&&!component.has(next))todo.push(next);}extra.push(pack(start,component,'right',path+'/disconnected/'+start));for(const id of component)remaining.splice(remaining.indexOf(id),1);}
      return {width:tree.width+extra.reduce((sum,u)=>sum+u.width+W,0),place(left){tree.place(left);let x=left+tree.width+W;for(const unit of extra){unit.place(x);x+=unit.width+W;}}};
    }
    const tree=pack(data.rootPersonId,new Set(P.keys()),'center','root');tree.place(PAD);
    const nodes=Object.fromEntries([...P.keys()].map(id=>[id,{x:coords[id],y:PAD+(max-ranks[id])*LEVEL,w:W,h:H}]));
    const branches={};for(const id of P.keys()){const path=areas[personAreas[id]].path;branches[id]=id===data.rootPersonId?'root':path.startsWith('root0')?'mother':path.startsWith('root1')?'father':'other';}
    const edges=[],families=new Map();
    for(const p of P.values())if(p.Mommy||p.Daddy){const pair=JSON.stringify([p.Mommy,p.Daddy]);if(!families.has(pair))families.set(pair,{mom:p.Mommy,dad:p.Daddy,children:[]});families.get(pair).children.push(p.id);}
    let index=0;for(const family of families.values()){const id='family_'+index++;for(const parent of [family.mom,family.dad].filter(Boolean))edges.push({kind:'parent',tail:parent,head:id,paths:[],labels:[]});for(const child of family.children)edges.push({kind:'parent',tail:id,head:child,paths:[],labels:[]});}
    const seen=new Set();for(const p of P.values())for(const other of p.siblings||[]){const pair=key(p.id,other);if(seen.has(pair))continue;seen.add(pair);const q=P.get(other);if(![p.Mommy,p.Daddy].filter(Boolean).some(parent=>parent===q.Mommy||parent===q.Daddy))edges.push({kind:'sibling',tail:p.id,head:other,paths:[],labels:[]});}
    for(const r of data.relationships)edges.push({kind:'marriage',tail:r.personIds[0],head:r.personIds[1],relationshipId:r.id,status:r.status,paths:[],labels:[{text:r.status==='rozwiedzeni'?'rozwód':r.previousRelationshipId?'późniejsze małżeństwo':'małżeństwo',x:0,y:0}]});
    const rowOrder={};for(const[id,rank]of Object.entries(ranks)){rowOrder[rank]||=[];rowOrder[rank].push(id);}for(const ids of Object.values(rowOrder))ids.sort((a,b)=>nodes[a].x-nodes[b].x);
    const pairs=data.relationships.filter(r=>r.status==='trwa').map(r=>r.personIds);
    const result={nodes,edges,ranks,branches,direct:[...direct].sort(),generations:max-min+1,width:tree.width+2*PAD,height:(max-min)*LEVEL+H+2*PAD,disconnectedPeople:[...P.keys()].filter(id=>!connected.has(id)),layoutPolicy:{version:VERSION,areas,personAreas,rowOrder,pairs},layoutWarnings:[...new Set(warnings)]};
    alignChildren(result,P,W,GAP,PAD);
    result.edges=window.GenealogyRouting.routeEdges(nodes,edges);
    return result;
  }
  return {create,version:VERSION};
})();

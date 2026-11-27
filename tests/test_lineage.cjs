const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const context={window:{},structuredClone};vm.createContext(context);
vm.runInContext(fs.readFileSync('web/lineage.js','utf8'),context);
const collect=context.window.GenealogyLineage.collect;
const p=(id,Mommy=null,Daddy=null)=>({id,Mommy,Daddy});
// A shared ancestor, half-sibling, spouse, sideways branch and unknown parent.
const data={people:[p('chosen','mom','dad'),p('mom','shared','gm'),p('dad','shared','gf'),p('shared'),p('gm'),p('gf'),p('sibling','mom','dad'),p('aunt','shared'),p('cousin','aunt'),p('partner'),p('child','chosen','partner'),p('grandchild','child'),p('greatgrandchild','grandchild'),p('half','mom'),p('unrelated',null,'missing')],relationships:[{personIds:['chosen','partner']}]};
const edge=(tail,head,kind='parent')=>({kind,tail,head});
const edges=[edge('mom','f1'),edge('dad','f1'),edge('f1','chosen'),edge('f1','sibling'),edge('chosen','f2'),edge('partner','f2'),edge('f2','child'),edge('child','f3'),edge('f3','grandchild'),edge('grandchild','f4'),edge('f4','greatgrandchild'),edge('mom','half-f'),edge('half-f','half'),edge('chosen','partner','marriage'),edge('chosen','sibling','sibling')];
const before=JSON.stringify({data,edges});
let line=collect(data,edges,'chosen');
assert.deepEqual([...line.people].sort(),['chosen','mom','dad','shared','gm','gf','child','grandchild','greatgrandchild'].sort());
assert.deepEqual([...line.edges],[0,1,2,4,6,7,8,9,10],'Only traversed parent stems/child legs; no sibling, half-sibling or co-parent stem');
assert.equal(JSON.stringify({data,edges}),before);
line=collect(data,edges,'mom');
for(const id of ['sibling','half','chosen','child','grandchild','greatgrandchild'])assert(line.people.has(id),'Descendants on every generation');
assert(!line.people.has('dad'));assert(!line.people.has('aunt'));assert(!line.people.has('cousin'));
assert(line.edges.has(3)&&line.edges.has(11)&&line.edges.has(12));
assert(!line.edges.has(1)&&!line.edges.has(5));
for(const selected of [null,'absent']) {line=collect(data,edges,selected);assert.equal(line.selected,null);assert.equal(line.people.size,0);assert.equal(line.edges.size,0);}
line=collect(data,edges,'unrelated');assert.deepEqual([...line.people],['unrelated']);
// Recompute after an active draft changes parentage; no stale cached relation.
const edited=structuredClone(data);edited.people.find(p=>p.id==='child').Mommy='partner';
line=collect(edited,edges,'chosen');assert(!line.people.has('child'));assert(!line.edges.has(4));
// Defensive cycle termination and repeated paths, without changing bad records.
const cycle={people:[p('a','b'),p('b','c'),p('c','a')]};
line=collect(cycle,[], 'a');assert.equal(line.people.size,3);
console.log('Direct lineage: unlimited ancestors/descendants, shared paths, no sideways expansion, exact junction halves, reset, active-data changes and cycle guard verified.');

// Overlay paths follow only the collected segments, including rerouted moves;
// changing or clearing selection must remove the previous geometry/gradients.
class Element {
 constructor(tag){this.tag=tag;this.attrs={};this.children=[];}
 setAttribute(key,value){this.attrs[key]=String(value);}
 append(child){child.parent=this;this.children.push(child);}
 remove(){this.parent.children=this.parent.children.filter(child=>child!==this);}
 querySelector(selector){return this.children.find(child=>'.'+child.attrs.class===selector)||null;}
}
context.document={createElementNS:(_,tag)=>new Element(tag)};
const svg=new Element('svg'),routed=[...edges.map(e=>({...e,paths:[[[10,20],[10,40],[50,60],[50,80]]]}))];
line=collect(data,routed,'chosen');const canonical=JSON.stringify(routed);
context.window.GenealogyLineage.paint(svg,routed,line);
let overlay=svg.querySelector('.lineage-overlay');
assert.equal(overlay.children.filter(el=>el.tag==='path').length,line.edges.size*2);
assert.equal(overlay.children[0].children.length,line.edges.size,'One gradient per highlighted segment');
for(const el of overlay.children.filter(el=>el.tag==='path'))assert.equal(el.attrs['vector-effect'],'non-scaling-stroke','Overview accents retain a visible screen width');
routed[0].paths=[[[100,20],[100,40],[150,60],[150,80]]];
context.window.GenealogyLineage.paint(svg,routed,line);
assert.equal(svg.children.length,1,'Repaint replaces rather than stacks old overlays');
overlay=svg.querySelector('.lineage-overlay');assert.equal(overlay.children.find(el=>el.tag==='path').attrs.d,'M 100 20 C 100 40 150 60 150 80');
assert.equal(JSON.stringify(edges),JSON.stringify(JSON.parse(before).edges));
context.window.GenealogyLineage.paint(svg,routed,collect(data,routed,null));assert.equal(svg.children.length,0,'Clear removes the accent and its gradients');
assert.notEqual(JSON.stringify(routed),canonical,'Synthetic move really changed geometry');
console.log('Lineage overlay: exact paths, visible overview widths, rerouted coordinates, replacement and complete clearing verified.');

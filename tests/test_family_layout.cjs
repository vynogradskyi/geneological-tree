const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const context={window:{},structuredClone};vm.createContext(context);
for(const name of ['card-metrics','line-routing','family-layout','card-layout'])vm.runInContext(fs.readFileSync(`web/${name}.js`,'utf8'),context);
const create=context.window.GenealogyFamilyLayout.create;
const person=(id,Mommy=null,Daddy=null,siblings=[])=>({id,Mommy,Daddy,siblings,photo:null});
const relationship=(id,a,b,status=null)=>({id,personIds:[a,b],status,previousRelationshipId:null});
function check(data){
 const original=JSON.stringify(data),layout=create(data),n=layout.nodes;
 assert.equal(JSON.stringify(data),original);assert.equal(Object.keys(n).length,data.people.length);
 for(const p of data.people)if(p.Mommy&&p.Daddy)assert(n[p.Mommy].x<n[p.Daddy].x,`Mother/father: ${p.id}`);
 for(const ids of Object.values(layout.layoutPolicy.rowOrder))for(let i=1;i<ids.length;i++)assert(n[ids[i]].x>=n[ids[i-1]].x+n[ids[i-1]].w+24,`Collision: ${ids}`);
 for(const r of data.relationships.filter(r=>r.status==='trwa')){const row=layout.layoutPolicy.rowOrder[layout.ranks[r.personIds[0]]],indices=r.personIds.map(id=>row.indexOf(id));assert.equal(Math.abs(indices[0]-indices[1]),1,'Current couple must be adjacent');}
 return layout;
}
const data={rootPersonId:'root',people:[person('root','mother','father'),person('mother','mm','mf',['sister']),person('father','fm','ff'),person('mm','mmm','mmf'),person('mf'),person('fm'),person('ff'),person('mmm'),person('mmf'),person('sister','mm','mf',['mother']),person('uncle'),person('cousin','sister','uncle')],relationships:[relationship('parents','mother','father','trwa'),relationship('lateral','sister','uncle','trwa')]};
let layout=check(data);
assert.equal(layout.branches.mother,'mother');assert.equal(layout.branches.father,'father');
const area=layout.layoutPolicy.areas[layout.layoutPolicy.personAreas.mother];
for(const id of ['sister','cousin','uncle'])assert(layout.nodes[id].x>=area.left&&layout.nodes[id].x+200<=area.right,'Lateral family stays in its maternal area');
const remarried={rootPersonId:'child',people:[person('child','mother','ex'),person('mother',null,null,['sister']),person('sister',null,null,['mother']),person('current'),person('ex'),person('sibling-child','sister',null)],relationships:[relationship('old','mother','ex','rozwiedzeni'),relationship('new','mother','current','trwa')]};
layout=check(remarried);assert(Math.abs(layout.nodes.mother.x-layout.nodes.sister.x)<Math.abs(layout.nodes.mother.x-layout.nodes.ex.x));
assert.equal(layout.layoutPolicy.pairs.length,1);
const moved=context.window.GenealogyCardLayout.constrained(layout.nodes,layout.layoutPolicy,'mother',-10000);
assert.equal(moved.current-layout.nodes.current.x,moved.mother-layout.nodes.mother.x,'Move current couple together');
for(const id of ['ex','sister'])assert.equal(moved[id],layout.nodes[id].x);
remarried.relationships[1].status=null;layout=check(remarried);assert.equal(layout.layoutPolicy.pairs.length,0,'Unknown marriage is not current');
const bad=structuredClone(data);bad.people.find(p=>p.id==='mmm').Mommy='root';assert.throws(()=>create(bad),/pokolenia/);
console.log('Family layout: recursive parent order, uneven branches, lateral family, current/ex spouses, constraints and unchanged records verified.');

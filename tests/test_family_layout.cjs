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
 const families=new Map();
 for(const p of data.people)if(p.Mommy||p.Daddy){const key=JSON.stringify([p.Mommy,p.Daddy]);if(!families.has(key))families.set(key,[]);families.get(key).push(p);}
 for(const group of families.values())if(group.length===1){
  const child=group[0],parents=[child.Mommy,child.Daddy].filter(Boolean);
  const axis=parents.reduce((sum,id)=>sum+n[id].x+n[id].w/2,0)/parents.length;
  assert(Math.abs(n[child.id].x+n[child.id].w/2-axis)<1e-5,`Child axis: ${child.id}`);
  const joint=layout.edges.find(edge=>edge.kind==='parent'&&edge.head===child.id);
  assert(joint.paths.length,'Parenthood remains routed');
  for(const path of joint.paths)for(const point of path)assert(Math.abs(point[0]-axis)<1e-5,'Singleton child leg is vertical');
 }
 for(const node of Object.values(n))assert(Number.isFinite(node.x)&&node.x>=64&&node.x+node.w<=layout.width-64+1e-5);
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
for(const role of ['Mommy','Daddy']){
 const chain={rootPersonId:'youngest',people:[person('youngest'),person('middle'),person('oldest')],relationships:[]};
 chain.people[0][role]='middle';chain.people[1][role]='oldest';
 const n=check(chain).nodes;
 assert(Math.abs(n.youngest.x-n.oldest.x)<1e-5,'Three generations stay on one axis');
}
const marriedChild={rootPersonId:'child',people:[person('child','mom','dad'),person('mom','grandma','grandpa'),person('dad'),person('grandma'),person('grandpa'),person('partner'),person('neighbor',null,null,['dad'])],relationships:[relationship('child-pair','child','partner','trwa')]};
check(marriedChild);
const multiple={rootPersonId:'child',people:[person('child','mom','dad'),person('sibling','mom','dad'),person('mom'),person('dad'),person('detached')],relationships:[]};
layout=check(multiple);assert.notEqual(layout.nodes.child.x,layout.nodes.sibling.x,'Siblings have separate cards');
assert.equal(JSON.stringify(create(multiple)),JSON.stringify(layout),'Deterministic reset geometry');
const bad=structuredClone(data);bad.people.find(p=>p.id==='mmm').Mommy='root';assert.throws(()=>create(bad),/pokolenia/);
console.log('Family layout: child axes, vertical legs, chains, spouses, siblings, uneven branches, reset, bounds and unchanged records verified.');

// Independent families occupy their own child spans, with a movable parent.
// An unrelated selected/root family must not pull the other children inward.
for(const rootPersonId of ['a1','b1','outside']) {
 const separate={rootPersonId,people:[person('pa'),person('pb'),person('a1','pa'),person('a2','pa'),person('b1','pb'),person('b2','pb'),person('grandchild','a1'),person('outside')],relationships:[]};
 const n=check(separate).nodes;
 for(const [parent,kids] of [['pa',['a1','a2']],['pb',['b1','b2']]]) {
  const midpoint=(n[kids[0]].x+n[kids[1]].x)/2;
  assert(Math.abs(n[parent].x-midpoint)<1,'A movable parent centres on its own child span');
 }
 const a=['a1','a2'].map(id=>n[id].x),b=['b1','b2'].map(id=>n[id].x);
 assert(Math.max(...a)+224<=Math.min(...b)+1e-5||Math.max(...b)+224<=Math.min(...a)+1e-5,'Independent child spans remain separate');
}
const broad={rootPersonId:'leaf',people:[person('ancestor'),...Array.from({length:7},(_,i)=>person('child'+i,'ancestor')),person('leaf','child0'),person('partner'),person('grandchild','child6'),person('greatgrandchild','grandchild')],relationships:[relationship('pair','leaf','partner','trwa')]};
layout=check(broad);
const children=broad.people.filter(p=>p.Mommy==='ancestor').map(p=>layout.nodes[p.id].x);
assert(Math.abs(layout.nodes.ancestor.x-(Math.min(...children)+Math.max(...children))/2)<2,'Broad family parent moves above the children, including the remote descendant chain');
assert.equal(JSON.stringify(create(broad)),JSON.stringify(layout),'New geometry remains deterministic');
console.log('Independent child areas, movable broad-family parent, root independence and descendant-chain clearance verified.');

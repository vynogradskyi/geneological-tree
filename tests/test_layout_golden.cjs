// TC-UNIT-GOLDEN: the automatic tree of the synthetic fixture must not change unnoticed.
// Card positions, generations, branches, colours, line counts and highlighted lineages are compared
// with tests/golden/e2e-layout.json. After an INTENDED layout change (agreed in a backlog task),
// review the printed difference and refresh the reference:
//   UPDATE_GOLDEN=1 node tests/test_layout_golden.cjs
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.join(__dirname,'..'),goldenFile=path.join(__dirname,'golden/e2e-layout.json');
const context={window:{},structuredClone};vm.createContext(context);
for(const name of ['card-metrics','line-routing','family-layout','card-layout','branch-colors','card-view','lineage'])
 vm.runInContext(fs.readFileSync(path.join(root,'web',name+'.js'),'utf8'),context);
const W=context.window,data=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/e2e/family-tree.json'),'utf8'));
const model=W.GenealogyFamilyLayout.create(data,{});W.GenealogyCardView.normalize(model);
const colors=W.GenealogyColors.create(data,model.edges,{});
const round=n=>Math.round(n*10)/10,sorted=object=>Object.fromEntries(Object.entries(object).sort(([a],[b])=>a.localeCompare(b)));
const lineage=id=>{const line=W.GenealogyLineage.collect(data,model.edges,id);return [...line.people].sort();};
const actual={
 size:{width:round(model.width),height:round(model.height)},
 cards:sorted(Object.fromEntries(Object.entries(model.nodes).map(([id,n])=>[id,{x:round(n.x),y:round(n.y),w:n.w,h:n.h,generation:model.ranks[id],branch:model.branches[id],color:colors.people[id].color}]))),
 rows:Object.fromEntries(Object.entries(model.layoutPolicy.rowOrder).sort(([a],[b])=>a-b)),
 edges:model.edges.reduce((count,e)=>({...count,[e.kind]:(count[e.kind]||0)+e.paths.length}),{}),
 lineage:{[data.rootPersonId]:lineage(data.rootPersonId),person_0003:lineage('person_0003'),person_0009:lineage('person_0009')},
};
const json=JSON.stringify(JSON.parse(JSON.stringify(actual)),null,1)+'\n';
if(process.env.UPDATE_GOLDEN||!fs.existsSync(goldenFile)){
 fs.mkdirSync(path.dirname(goldenFile),{recursive:true});fs.writeFileSync(goldenFile,json);
 console.log('Golden layout reference written: tests/golden/e2e-layout.json — review it with git diff before committing.');
}else{
 const expected=JSON.parse(fs.readFileSync(goldenFile,'utf8')),now=JSON.parse(json),changes=[];
 for(const [id,card] of Object.entries(expected.cards))for(const [key,value] of Object.entries(card))
  if(JSON.stringify(now.cards[id]?.[key])!==JSON.stringify(value))changes.push(`${id}.${key}: ${JSON.stringify(value)} → ${JSON.stringify(now.cards[id]?.[key])}`);
 for(const key of ['size','rows','edges','lineage'])if(JSON.stringify(now[key])!==JSON.stringify(expected[key]))changes.push(`${key}: ${JSON.stringify(expected[key])} → ${JSON.stringify(now[key])}`);
 assert.deepEqual(changes,[],'The automatic tree changed. If this is intended, run UPDATE_GOLDEN=1 node tests/test_layout_golden.cjs and commit the reference.');
 console.log(`Golden layout: ${Object.keys(now.cards).length} cards, generations, branches, colours and lineages unchanged.`);
}

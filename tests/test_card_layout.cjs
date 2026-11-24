const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const context={window:{},structuredClone};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/line-routing.js'),'utf8'),context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/card-layout.js'),'utf8'),context);const{resolveRow,routeEdges}=context.window.GenealogyCardLayout;
for(let size=1;size<=12;size++)for(let active=0;active<size;active++)for(const x of [-300,20,150,400,1500,4000]){
 const nodes={},row=[];for(let i=0;i<size;i++){const id='p'+i;row.push(id);nodes[id]={x:20+i*170,y:300,w:150,h:234};}
 const result=resolveRow(nodes,row,'p'+active,x),sorted=Object.keys(result).sort((a,b)=>result[a]-result[b]);assert.equal(Object.keys(result).length,size);assert(result[sorted[0]]>=20);for(let i=1;i<size;i++)assert(result[sorted[i]]>=result[sorted[i-1]]+150+18-1e-6);assert.equal(nodes['p'+active].y,300);
}
const nodes={dad:{x:500,y:20,w:150,h:234},mom:{x:800,y:20,w:150,h:234},child:{x:100,y:360,w:150,h:234}};
const edges=[{kind:'parent',tail:'dad',head:'family',paths:[],labels:[]},{kind:'parent',tail:'mom',head:'family',paths:[],labels:[]},{kind:'parent',tail:'family',head:'child',paths:[],labels:[]},{kind:'marriage',tail:'dad',head:'mom',paths:[],labels:[{text:'małżeństwo',x:0,y:0}]}];
const routed=routeEdges(nodes,edges);assert.equal(routed[0].paths[0][0][0],575);assert.equal(routed[0].paths[0][0][1],254);assert.equal(routed[2].paths[0].at(-1)[0],175);assert.equal(routed[2].paths[0].at(-1)[1],360);assert.equal(routed[3].paths[0][0][0],575);assert.equal(routed[3].paths[0].at(-1)[0],875);assert.equal(routed[3].labels[0].x,725);assert.equal(edges[0].paths.length,0);
console.log('Horizontal placement: 468 collision/boundary cases; family and marriage anchors verified.');

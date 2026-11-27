// Connection anchors between cards (web/line-routing.js), shared by the browser and the build.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const context={window:{},structuredClone};vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/line-routing.js'),'utf8'),context);
const {routeEdges}=context.window.GenealogyRouting;
const nodes={dad:{x:500,y:20,w:150,h:234},mom:{x:800,y:20,w:150,h:234},child:{x:100,y:360,w:150,h:234}};
const edges=[{kind:'parent',tail:'dad',head:'family',paths:[],labels:[]},{kind:'parent',tail:'mom',head:'family',paths:[],labels:[]},{kind:'parent',tail:'family',head:'child',paths:[],labels:[]},{kind:'marriage',tail:'dad',head:'mom',paths:[],labels:[{text:'małżeństwo',x:0,y:0}]}];
const routed=routeEdges(nodes,edges);
assert.equal(routed[0].paths[0][0][0],575);assert.equal(routed[0].paths[0][0][1],254);
assert.equal(routed[2].paths[0].at(-1)[0],175);assert.equal(routed[2].paths[0].at(-1)[1],360);
assert.equal(routed[3].paths[0][0][0],575);assert.equal(routed[3].paths[0].at(-1)[0],875);assert.equal(routed[3].labels[0].x,725);
assert.equal(edges[0].paths.length,0,'Routing does not mutate its input');
console.log('Line routing: family and marriage anchors verified.');

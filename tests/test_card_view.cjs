const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const context={window:{},structuredClone};vm.createContext(context);
for(const name of ['card-metrics','card-view'])vm.runInContext(fs.readFileSync(`web/${name}.js`,'utf8'),context);
const view=context.window.GenealogyCardView,metrics=context.window.GenealogyCardMetrics;
const original={data:{people:[{id:'p',photo:'photos/synthetic.png'}]},nodes:{p:{x:30,y:60,w:150,h:234}},width:300,height:600,ranks:{p:0},edges:[{kind:'parent',tail:'p',head:'f',paths:[[[105,294],[105,310],[120,330],[120,340]]],labels:[{text:'synthetic',x:105,y:35}]}]};
const data=JSON.stringify(original.data),cache={signature:JSON.stringify({nodes:Object.entries(original.nodes),edges:original.edges.map(e=>[e.kind,e.tail,e.head]),ranks:Object.entries(original.ranks)}),positions:{p:90}};
view.normalize(original);assert.equal(original.nodes.p.w,metrics.width);assert.equal(original.nodes.p.h,metrics.height);assert.equal(original.nodes.p.x,40);assert.equal(original.edges[0].paths[0][0][1],392);assert.equal(JSON.stringify(original.data),data);
const once=JSON.stringify(original);view.normalize(original);assert.equal(JSON.stringify(original),once);
assert.equal(view.migratePlacement(cache,original).p,120);
original.ranks.p=1;assert.equal(view.migratePlacement(cache,original),null);
console.log('Card geometry: shared dimensions, scaled line anchors, idempotent resize and saved-placement migration verified.');
vm.runInContext(fs.readFileSync('web/card-layout.js','utf8'),context);
for(const desired of [-100,300,1200]){
 const nodes={a:{x:20,y:100,w:200,h:312},b:{x:244,y:100,w:200,h:312},c:{x:468,y:100,w:200,h:312}};
 const resolved=context.window.GenealogyCardLayout.resolveRow(nodes,['a','b','c'],'b',desired);
 const xs=Object.values(resolved).sort((a,b)=>a-b);for(let i=1;i<xs.length;i++)assert(xs[i]-xs[i-1]>=metrics.width+metrics.gap);
}
const drawCalls=[],textCalls=[],ctx={setLineDash(){},beginPath(){},roundRect(){},fill(){},stroke(){},save(){},clip(){},fillRect(){},restore(){},drawImage(...args){drawCalls.push(args);},fillText(...args){textCalls.push(args);},measureText(value){return{width:String(value).length*7};}};
view.drawPDF(ctx,{node:{x:0,y:0,w:200,h:312},branch:'father',root:false,image:{width:80,height:160},names:['Synthetic','Example'],subtitle:'',dates:'1989 – ?',initials:'SE',noPhoto:'no photo'});
assert.equal(drawCalls.length,1);assert.equal(drawCalls[0][3]/drawCalls[0][4],.5);assert(textCalls.some(args=>args[0]==='Synthetic'));assert(textCalls.some(args=>args[0]==='1989 – ?'));
console.log('Wide-card collisions and PDF photo aspect ratio verified without generating a PDF.');

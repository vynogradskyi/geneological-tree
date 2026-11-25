/* Presentation only: stable family regions, mixed through confirmed parent links.
   Oklab conversion: https://bottosson.github.io/posts/oklab/ (public domain). */
window.GenealogyColors = (() => {
  const palette=Object.freeze({sage:'#73884e',jade:'#338572',blue:'#4979aa',lilac:'#8b6a9e',
    neutral:'#879088',surface:'#fffefb',background:'#f5f4ee',text:'#263a32',muted:'#59685e'});
  const rgb=hex=>hex.match(/[a-f\d]{2}/gi).map(value=>parseInt(value,16)/255);
  const linear=value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4;
  const encoded=value=>value<=.0031308?12.92*value:1.055*value**(1/2.4)-.055;
  const hex=values=>'#'+values.map(value=>Math.round(Math.max(0,Math.min(1,value))*255).toString(16).padStart(2,'0')).join('');
  function lab(color){
    const[r,g,b]=rgb(color).map(linear);
    const l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b),m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b),s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
    return [.2104542553*l+.793617785*m-.0040720468*s,1.9779984951*l-2.428592205*m+.4505937099*s,.0259040371*l+.7827717662*m-.808675766*s];
  }
  function fromLab([L,a,b]){
    const l=(L+.3963377774*a+.2158037573*b)**3,m=(L-.1055613458*a-.0638541728*b)**3,s=(L-.0894841775*a-1.291485548*b)**3;
    return hex([4.0767416621*l-3.3077115913*m+.2309699292*s,-1.2684380046*l+2.6097574011*m-.3413193965*s,-.0041960863*l-.7034186147*m+1.707614701*s].map(encoded));
  }
  function mix(colors){
    if(!colors.length)return palette.neutral;
    if(colors.every(color=>color===colors[0]))return colors[0];
    const values=colors.map(lab);
    return fromLab([0,1,2].map(i=>values.reduce((sum,value)=>sum+value[i],0)/values.length));
  }
  // A restrained 8% sRGB surface tint; portrait pixels are never processed.
  function tint(color){const foreground=rgb(color),surface=rgb(palette.surface);return hex(surface.map((value,i)=>value*.92+foreground[i]*.08));}
  function stops(from,to){
    const a=lab(from),b=lab(to);
    return [0,.25,.5,.75,1].map(offset=>[offset,offset===0?from:offset===1?to:fromLab(a.map((value,i)=>value*(1-offset)+b[i]*offset))]);
  }
  function create(data,edges=[]){
    const people=new Map(data.people.map(p=>[p.id,p])),root=people.get(data.rootPersonId);
    if(!root)throw Error('Missing root for branch colors.');
    const seeds=new Map(),regional=new Map(),siblings=new Map([...people.keys()].map(id=>[id,new Set()]));
    function seedAncestors(id,color,seen=new Set()){
      if(!id||!people.has(id)||seen.has(id))return;seen.add(id);
      if(!seeds.has(id))seeds.set(id,new Set());seeds.get(id).add(color);
      const p=people.get(id);seedAncestors(p.Mommy,color,seen);seedAncestors(p.Daddy,color,seen);
    }
    for(const[field,colors]of [['Mommy',[palette.sage,palette.jade]],['Daddy',[palette.blue,palette.lilac]]]){
      const parent=people.get(root[field]);if(!parent)continue;
      regional.set(parent.id,mix(colors));
      seedAncestors(parent.Mommy,colors[0]);seedAncestors(parent.Daddy,colors[1]);
    }
    // Explicit sibling links may share a display region. Marriage never seeds a region.
    for(const p of people.values())for(const id of p.siblings||[])if(siblings.has(id)){siblings.get(p.id).add(id);siblings.get(id).add(p.id);}
    function fallback(id){
      if(seeds.has(id))return mix([...seeds.get(id)].sort());
      if(regional.has(id))return regional.get(id);
      const seen=new Set([id]),queue=[id],colors=new Set();
      for(let i=0;i<queue.length;i++)for(const other of siblings.get(queue[i]))if(!seen.has(other)){
        seen.add(other);queue.push(other);
        for(const color of seeds.get(other)||[])colors.add(color);
        if(regional.has(other))colors.add(regional.get(other));
      }
      return mix([...colors].sort());
    }
    const nodes={},active=new Set();
    function visit(id){
      if(nodes[id])return nodes[id];if(active.has(id))throw Error('Ancestry cycle in branch colors.');
      active.add(id);const p=people.get(id);
      const parents=[p.Mommy,p.Daddy].map(parent=>people.has(parent)?visit(parent):null);
      const known=parents.filter(Boolean),color=known.length?mix(known.map(parent=>parent.color)):fallback(id);
      nodes[id]={color,tint:tint(color),bands:known.length?parents.map(parent=>parent?.color||palette.neutral):[color,color]};
      active.delete(id);return nodes[id];
    }
    for(const id of [...people.keys()].sort())visit(id);
    const joints=new Map();
    for(const edge of edges)if(edge.kind==='parent'&&nodes[edge.tail]){
      if(!joints.has(edge.head))joints.set(edge.head,[]);joints.get(edge.head).push(edge.tail);
    }
    const colorAt=id=>nodes[id]?.color||(joints.has(id)?mix(joints.get(id).map(parent=>nodes[parent].color)):palette.neutral);
    return {people:nodes,edge:edge=>({from:colorAt(edge.tail),to:colorAt(edge.head)})};
  }
  function canvasStroke(ctx,edge,points,theme){
    if(edge.kind!=='parent')return edge.kind==='marriage'?'#997ca3':'#9b8a62';
    const {from,to}=theme.edge(edge);if(from===to)return from;
    const [x1,y1]=points[0],[x2,y2]=points.at(-1),gradient=ctx.createLinearGradient(x1,y1,x2,y2);
    for(const[offset,color]of stops(from,to))gradient.addColorStop(offset,color);return gradient;
  }
  return {palette,mix,tint,stops,create,canvasStroke};
})();

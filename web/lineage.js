/* Direct ancestry/descendancy only. Selection never changes family geometry. */
window.GenealogyLineage = (() => {
  function collect(data, edges, selected) {
    const people=new Map(data.people.map(person=>[person.id,person]));
    const result={selected:people.has(selected)?selected:null,people:new Set(),edges:new Set()};
    if(!result.selected)return result;
    const children=new Map([...people.keys()].map(id=>[id,[]]));
    for(const person of people.values())for(const parent of [person.Mommy,person.Daddy])if(people.has(parent))children.get(parent).push(person.id);
    const links=new Map();
    function link(parent,child){if(!links.has(parent))links.set(parent,new Set());links.get(parent).add(child);}
    function walk(up) {
      const visited=new Set(),queue=[selected];
      for(let i=0;i<queue.length;i++) {
        const id=queue[i];if(visited.has(id))continue;visited.add(id);result.people.add(id);
        const next=up?[people.get(id).Mommy,people.get(id).Daddy].filter(id=>people.has(id)):children.get(id);
        for(const other of next){up?link(other,id):link(id,other);if(!visited.has(other))queue.push(other);}
      }
    }
    walk(true);walk(false);
    // Parenthood uses shared junctions; activate each half only when a real
    // parent→child path traverses it. A co-parent is not added by marriage.
    const junctions=new Map();
    for(const edge of edges)if(edge.kind==='parent') {
      const junction=people.has(edge.tail)?edge.head:edge.tail;
      if(!junctions.has(junction))junctions.set(junction,{parents:[],children:[]});
      const family=junctions.get(junction);
      if(people.has(edge.tail))family.parents.push(edge.tail);
      if(people.has(edge.head))family.children.push(edge.head);
    }
    edges.forEach((edge,index)=>{
      if(edge.kind!=='parent')return;
      const fromParent=people.has(edge.tail),family=junctions.get(fromParent?edge.head:edge.tail);
      const active=fromParent?family.children.some(child=>links.get(edge.tail)?.has(child)):family.parents.some(parent=>links.get(parent)?.has(edge.head));
      if(active)result.edges.add(index);
    });
    return result;
  }
  function paint(svg, edges, line) {
    svg.querySelector('.lineage-overlay')?.remove();
    if(!line.selected)return;
    const ns='http://www.w3.org/2000/svg',make=tag=>document.createElementNS(ns,tag);
    const group=make('g'),defs=make('defs');group.setAttribute('class','lineage-overlay');group.setAttribute('aria-hidden','true');group.append(defs);
    for(const index of line.edges)for(const [part,points] of edges[index].paths.entries()) {
      const gradient=make('linearGradient'),id=`lineage-accent-${index}-${part}`;
      gradient.id=id;gradient.setAttribute('gradientUnits','userSpaceOnUse');
      for(const [key,value] of Object.entries({x1:points[0][0],y1:points[0][1],x2:points.at(-1)[0],y2:points.at(-1)[1]}))gradient.setAttribute(key,value);
      for(const [offset,color] of [['0%','#51e0d5'],['48%','#a7a3ff'],['100%','#ffd17a']]) {
        const stop=make('stop');stop.setAttribute('offset',offset);stop.setAttribute('stop-color',color);gradient.append(stop);
      }
      defs.append(gradient);
      const d=`M ${points[0].join(' ')} C ${points.slice(1).map(point=>point.join(' ')).join(' ')}`;
      for(const style of ['halo','gradient']) {
        const path=make('path');path.setAttribute('d',d);path.setAttribute('class','lineage-'+style);path.setAttribute('vector-effect','non-scaling-stroke');
        if(style==='gradient')path.setAttribute('stroke',`url(#${id})`);
        group.append(path);
      }
    }
    svg.append(group);
  }
  return {collect,paint};
})();

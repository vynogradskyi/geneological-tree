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
  return {collect};
})();

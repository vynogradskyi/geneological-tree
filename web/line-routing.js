/* Pure routing shared by the initial layout and personal card movements. */
window.GenealogyRouting = (() => {
  function routeEdges(nodes,edges){
    const center=node=>node.x+node.w/2,families=new Map();
    for(const edge of edges){if(edge.kind!=='parent')continue;const junction=nodes[edge.tail]?edge.head:edge.tail;if(!families.has(junction))families.set(junction,{parents:[],children:[]});const f=families.get(junction);if(nodes[edge.tail])f.parents.push(edge.tail);if(nodes[edge.head])f.children.push(edge.head);}
    const junctions=new Map();
    for(const[id,f]of families){if(!f.parents.length||!f.children.length)continue;const parents=f.parents.map(id=>nodes[id]),children=f.children.map(id=>nodes[id]);junctions.set(id,{x:parents.reduce((sum,p)=>sum+center(p),0)/parents.length,y:(Math.max(...parents.map(p=>p.y+p.h))+Math.min(...children.map(p=>p.y)))/2});}
    let arc=0;
    return edges.map(original=>{
      const edge=structuredClone(original);
      if(edge.kind==='parent'){
        const parent=nodes[edge.tail],child=nodes[edge.head],joint=junctions.get(parent?edge.head:edge.tail);if(!joint)return edge;
        if(parent){const x=center(parent),y=parent.y+parent.h;edge.paths=[[[x,y],[x,y+(joint.y-y)*.7],[joint.x,joint.y],[joint.x,joint.y]]];}
        else if(child){const x=center(child),y=child.y,d=(y-joint.y)*.5;edge.paths=[[[joint.x,joint.y],[joint.x,joint.y+d],[x,y-d],[x,y]]];}
      }else if(nodes[edge.tail]&&nodes[edge.head]){
        const a=nodes[edge.tail],b=nodes[edge.head],x1=center(a),x2=center(b),roof=Math.min(a.y,b.y)-32-(arc++%3)*16;
        edge.paths=[[[x1,a.y],[x1,roof],[x2,roof],[x2,b.y]]];
        edge.labels=(edge.labels||[]).map(label=>({...label,x:(x1+x2)/2,y:roof-7}));
      }
      return edge;
    });
  }
  return {routeEdges};
})();

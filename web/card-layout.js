/* Optional horizontal card placement. Family records are never changed here. */
window.GenealogyCardLayout = (() => {
  const clone=value=>structuredClone(value);
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const GAP=18,LEFT=20,LIMIT=50;
  const center=node=>node.x+node.w/2;
  function fingerprint(model){return JSON.stringify({nodes:Object.entries(model.nodes).sort(([a],[b])=>a.localeCompare(b)),edges:model.edges.map(e=>[e.kind,e.tail,e.head]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),ranks:Object.entries(model.ranks).sort(([a],[b])=>a.localeCompare(b))});}
  function positions(model){return Object.fromEntries(Object.entries(model.nodes).map(([id,node])=>[id,node.x]));}
  function resolveRow(nodes,row,active,x){
    const desired=Math.max(LEFT,x),others=row.filter(id=>id!==active).sort((a,b)=>nodes[a].x-nodes[b].x);
    const index=others.filter(id=>center(nodes[id])<desired+nodes[active].w/2).length;
    const order=[...others.slice(0,index),active,...others.slice(index)],result={};result[active]=desired;
    for(let i=index-1;i>=0;i--){const id=order[i],next=order[i+1];result[id]=Math.min(nodes[id].x,result[next]-nodes[id].w-GAP);}
    for(let i=index+1;i<order.length;i++){const id=order[i],previous=order[i-1];result[id]=Math.max(nodes[id].x,result[previous]+nodes[previous].w+GAP);}
    const shift=Math.max(0,LEFT-result[order[0]]);if(shift)for(const id of order)result[id]+=shift;
    return result;
  }
  function routeEdges(nodes,edges){
    const families=new Map();
    for(const edge of edges){if(edge.kind!=='parent')continue;const junction=nodes[edge.tail]?edge.head:edge.tail;if(!families.has(junction))families.set(junction,{parents:[],children:[]});const f=families.get(junction);if(nodes[edge.tail])f.parents.push(edge.tail);if(nodes[edge.head])f.children.push(edge.head);}
    const junctions=new Map();
    for(const[id,f]of families){if(!f.parents.length||!f.children.length)continue;const parents=f.parents.map(id=>nodes[id]),children=f.children.map(id=>nodes[id]);junctions.set(id,{x:parents.reduce((s,p)=>s+center(p),0)/parents.length,y:(Math.max(...parents.map(p=>p.y+p.h))+Math.min(...children.map(p=>p.y)))/2});}
    let arc=0;
    return edges.map(original=>{
      const edge=clone(original);
      if(edge.kind==='parent'){
        const parent=nodes[edge.tail],child=nodes[edge.head],joint=junctions.get(parent?edge.head:edge.tail);
        if(!joint)return edge;
        if(parent){const x=center(parent),y=parent.y+parent.h;edge.paths=[[[x,y],[x,y+(joint.y-y)*.7],[joint.x,joint.y],[joint.x,joint.y]]];}
        else if(child){const x=center(child),y=child.y,d=(y-joint.y)*.5;edge.paths=[[[joint.x,joint.y],[joint.x,joint.y+d],[x,y-d],[x,y]]];}
      }else if(nodes[edge.tail]&&nodes[edge.head]){
        const a=nodes[edge.tail],b=nodes[edge.head],x1=center(a),x2=center(b),y1=a.y,y2=b.y;
        const lane=32+(arc++%3)*12;const roof=Math.min(y1,y2)-lane;
        edge.paths=[[[x1,y1],[x1,roof],[x2,roof],[x2,y2]]];
        edge.labels=(edge.labels||[]).map(label=>({...label,x:(x1+x2)/2,y:(y1+y2)/8+roof*.75-5}));
      }
      return edge;
    });
  }
  function create({model,onChange,onMessage=()=>{},onActiveChange=()=>{}}){
    const key='genealogy-card-layout-v1:'+location.pathname.replace(/[^/]*$/,'')+model.data.rootPersonId;
    let base={nodes:clone(model.nodes),edges:clone(model.edges),width:model.width,height:model.height};
    let signature=fingerprint(model),undo=[],redo=[],active=null,enabled=true,cache=null;
    const toggle=document.getElementById('toggle-card-drag'),undoButton=document.getElementById('undo-layout'),redoButton=document.getElementById('redo-layout'),resetButton=document.getElementById('reset-layout');
    try{cache=JSON.parse(localStorage.getItem(key));if(typeof cache?.enabled==='boolean')enabled=cache.enabled;}catch{}
    const basePositions=()=>Object.fromEntries(Object.entries(base.nodes).map(([id,node])=>[id,node.x]));
    function valid(saved){
      if(!saved||Object.keys(saved).length!==Object.keys(base.nodes).length)return false;
      for(const[id,x]of Object.entries(saved))if(!base.nodes[id]||!Number.isFinite(x)||x<0||x>100000)return false;
      const rows=new Map();for(const[id,node]of Object.entries(base.nodes)){const rank=model.ranks[id];if(!rows.has(rank))rows.set(rank,[]);rows.get(rank).push({x:saved[id],w:node.w});}
      for(const row of rows.values()){row.sort((a,b)=>a.x-b.x);for(let i=1;i<row.length;i++)if(row[i].x<row[i-1].x+row[i-1].w-1)return false;}
      return true;
    }
    function controls(){
      toggle.setAttribute('aria-pressed',String(enabled));toggle.textContent=enabled?'Przesuwanie kart: włączone':'Przesuwanie kart: wyłączone';
      document.getElementById('viewport').classList.toggle('cards-draggable',enabled);
      undoButton.disabled=!undo.length||!!active;redoButton.disabled=!redo.length||!!active;resetButton.disabled=same(positions(model),basePositions())||!!active;
      document.getElementById('layout-hint').textContent=enabled?'Przeciągnij kartę myszą w poziomie. Tło przesuwa drzewo.':'Przeciąganie przesuwa całe drzewo. Kliknięcie otwiera kartę.';
    }
    function persist(){try{localStorage.setItem(key,JSON.stringify({version:1,signature,positions:positions(model),enabled}));}catch{onMessage('Układ działa, ale przeglądarka nie mogła go zapisać na później.');}}
    function apply(saved){
      model.nodes=clone(base.nodes);for(const[id,x]of Object.entries(saved))if(model.nodes[id])model.nodes[id].x=x;
      const changed=!same(saved,basePositions());model.edges=changed?routeEdges(model.nodes,base.edges):clone(base.edges);
      model.width=changed?Math.max(base.width,...Object.values(model.nodes).map(n=>n.x+n.w+30)):base.width;model.height=base.height;
      onChange();controls();
    }
    function record(before){undo.push(before);if(undo.length>LIMIT)undo.shift();redo=[];persist();controls();}
    function cancel(){if(!active)return;const before=active.before;active=null;onActiveChange(null);apply(before);}
    const api={
      isEnabled:()=>enabled,
      isDragging:()=>!!active,
      start(id){if(!enabled||!model.nodes[id])return false;active={id,before:positions(model),nodes:clone(model.nodes),row:Object.keys(model.nodes).filter(other=>model.ranks[other]===model.ranks[id])};onActiveChange(id);controls();return true;},
      move(x){if(!active)return;const moved=resolveRow(active.nodes,active.row,active.id,x);apply({...active.before,...moved});},
      finish(){if(!active)return;const before=active.before;active=null;onActiveChange(null);if(!same(before,positions(model)))record(before);else controls();},
      cancel,
      undo(){if(active||!undo.length)return;redo.push(positions(model));apply(undo.pop());persist();},
      redo(){if(active||!redo.length)return;undo.push(positions(model));apply(redo.pop());persist();},
      reset(){if(active)return;const before=positions(model);if(same(before,basePositions()))return;apply(basePositions());record(before);onMessage('Przywrócono początkowy układ. Możesz cofnąć tę zmianę.');},
      toggle(){cancel();enabled=!enabled;persist();controls();},
      refresh(){
        const next=fingerprint(model),old=positionsFromCache();
        base={nodes:clone(model.nodes),edges:clone(model.edges),width:model.width,height:model.height};
        if(next!==signature){signature=next;undo=[];redo=[];active=null;apply(basePositions());persist();}
        else{apply(old&&valid(old)?old:basePositions());}
      }
    };
    // Position history is separate from the person editor and canonical family data.
    let latest=cache?.signature===signature&&valid(cache.positions)?cache.positions:null;
    function positionsFromCache(){return latest;}
    const change=onChange;onChange=()=>{latest=positions(model);change();};
    toggle.onclick=()=>api.toggle();undoButton.onclick=()=>api.undo();redoButton.onclick=()=>api.redo();resetButton.onclick=()=>api.reset();
    document.addEventListener('keydown',event=>{
      if(event.defaultPrevented||document.querySelector('dialog[open]')||event.target.closest('input,textarea,select,[contenteditable="true"]'))return;
      if(!(event.metaKey||event.ctrlKey))return;
      const code=event.key.toLowerCase();if(code==='z'){event.preventDefault();event.shiftKey?api.redo():api.undo();}else if(code==='y'){event.preventDefault();api.redo();}
    });
    apply(latest||basePositions());
    return api;
  }
  return{create,resolveRow,routeEdges};
})();

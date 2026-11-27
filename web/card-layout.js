/* Optional horizontal card placement. Family records are never changed here. */
window.GenealogyCardLayout = (() => {
  const clone=value=>structuredClone(value);
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const GAP=window.GenealogyCardMetrics?.gap||18,LEFT=20,LIMIT=50;
  const center=node=>node.x+node.w/2;
  function fingerprint(model){return JSON.stringify({nodes:Object.entries(model.nodes).sort(([a],[b])=>a.localeCompare(b)),edges:model.edges.map(e=>[e.kind,e.tail,e.head]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),ranks:Object.entries(model.ranks).sort(([a],[b])=>a.localeCompare(b)),policy:model.layoutPolicy||0});}
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
  const routeEdges=(nodes,edges)=>window.GenealogyRouting.routeEdges(nodes,edges);
  function constrained(nodes,policy,active,x){
    const ids=(policy.groups||policy.pairs).find(pair=>pair.includes(active))||[active],positions=Object.fromEntries(Object.entries(nodes).map(([id,n])=>[id,n.x]));
    let minimum=-Infinity,maximum=Infinity;
    for(const id of ids){const node=nodes[id],area=policy.areas[policy.personAreas[id]];minimum=Math.max(minimum,area.left-node.x);maximum=Math.min(maximum,area.right-node.w-node.x);}
    const row=Object.values(policy.rowOrder).find(row=>row.includes(active))||[],outsiders=row.filter(id=>!ids.includes(id)),left=Math.min(...ids.map(id=>nodes[id].x)),right=Math.max(...ids.map(id=>nodes[id].x+nodes[id].w));
    const previous=outsiders.filter(id=>nodes[id].x<left),next=outsiders.filter(id=>nodes[id].x>=right);
    if(previous.length)minimum=Math.max(minimum,Math.max(...previous.map(id=>nodes[id].x+nodes[id].w))+GAP-left);
    if(next.length)maximum=Math.min(maximum,Math.min(...next.map(id=>nodes[id].x))-GAP-right);
    if(minimum>maximum)return positions;
    const delta=Math.max(minimum,Math.min(maximum,x-nodes[active].x));for(const id of ids)positions[id]+=delta;return positions;
  }
  function create({model,onChange,onMessage=()=>{},onActiveChange=()=>{}}){
    const key='genealogy-card-layout-v1:'+location.pathname.replace(/[^/]*$/,'')+model.data.rootPersonId;
    let base={nodes:clone(model.nodes),edges:clone(model.edges),width:model.width,height:model.height};
    let signature=fingerprint(model),undo=[],redo=[],active=null,enabled=false,cache=null,previous=null,canPersist=true,desktopEnabled=false;
    const previousKey=key+':previous',historyKey=previousKey+':history';let history=[];
    const toggle=document.getElementById('toggle-card-drag'),undoButton=document.getElementById('undo-layout'),redoButton=document.getElementById('redo-layout'),resetButton=document.getElementById('reset-layout');
    try{cache=JSON.parse(localStorage.getItem(key));previous=JSON.parse(localStorage.getItem(previousKey));if(typeof cache?.enabled==='boolean'&&!matchMedia('(pointer:coarse), (max-width:760px), (max-width:1000px) and (max-height:500px)').matches)enabled=cache.enabled;}catch{}
    try{const saved=JSON.parse(localStorage.getItem(historyKey));if(Array.isArray(saved))history=saved;}catch{}
    desktopEnabled=cache?.enabled??false;
    const basePositions=()=>Object.fromEntries(Object.entries(base.nodes).map(([id,node])=>[id,node.x]));
    function valid(saved){
      if(!saved||Object.keys(saved).length!==Object.keys(base.nodes).length)return false;
      for(const[id,x]of Object.entries(saved))if(!base.nodes[id]||!Number.isFinite(x)||x<0||x>100000)return false;
      const rows=new Map();for(const[id,node]of Object.entries(base.nodes)){const rank=model.ranks[id];if(!rows.has(rank))rows.set(rank,[]);rows.get(rank).push({x:saved[id],w:node.w});}
      for(const row of rows.values()){row.sort((a,b)=>a.x-b.x);for(let i=1;i<row.length;i++)if(row[i].x<row[i-1].x+row[i-1].w-1)return false;}
      if(model.layoutPolicy){
        for(const[id,x]of Object.entries(saved)){const area=model.layoutPolicy.areas[model.layoutPolicy.personAreas[id]];if(x<area.left-1||x+base.nodes[id].w>area.right+1)return false;}
        for(const ids of Object.values(model.layoutPolicy.rowOrder))for(let i=1;i<ids.length;i++)if(saved[ids[i]]<saved[ids[i-1]]+base.nodes[ids[i-1]].w+GAP-1)return false;
        for(const pair of model.layoutPolicy.groups||model.layoutPolicy.pairs)if(Math.abs((saved[pair[0]]-base.nodes[pair[0]].x)-(saved[pair[1]]-base.nodes[pair[1]].x))>1)return false;
      }
      return true;
    }
    function archive(value){if(!value)return;if(previous&&!same(previous,value)&&!history.some(saved=>same(saved,previous)))history.push(clone(previous));previous=value;try{if(history.length)localStorage.setItem(historyKey,JSON.stringify(history));localStorage.setItem(previousKey,JSON.stringify(value));}catch{canPersist=false;onMessage('Nie udało się zachować wcześniejszego układu. Pobierz kopię przed zmianami.');}}
    function controls(){
      toggle.setAttribute('aria-pressed',String(enabled));toggle.textContent=enabled?'Przesuwanie kart: włączone':'Przesuwanie kart: wyłączone';
      document.getElementById('viewport').classList.toggle('cards-draggable',enabled);
      undoButton.disabled=!undo.length||!!active;redoButton.disabled=!redo.length||!!active;resetButton.disabled=same(positions(model),basePositions())||!!active;
      document.getElementById('layout-hint').textContent=enabled?'Przesuwaj w obrębie rodziny. Aktualni małżonkowie przesuwają się razem.':'Przeciąganie przesuwa drzewo. Jasna karta: podświetl linię. Ciemna karta: otwórz szczegóły.';
      document.getElementById('layout-backup-notice').hidden=!previous;
      document.getElementById('mobile-layout-exit').hidden=!enabled;
      document.body.classList.toggle('mobile-arranging',enabled&&window.GenealogyResponsive?.mobile);window.GenealogyI18n?.dom();
    }
    function persist(){if(!canPersist)return;try{localStorage.setItem(key,JSON.stringify({version:2,signature,positions:positions(model),enabled}));}catch{onMessage('Układ działa, ale przeglądarka nie mogła go zapisać na później.');}}
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
      move(x){if(!active)return;const moved=model.layoutPolicy?constrained(active.nodes,model.layoutPolicy,active.id,x):resolveRow(active.nodes,active.row,active.id,x);apply({...active.before,...moved});},
      finish(){if(!active)return;const before=active.before;active=null;onActiveChange(null);if(!same(before,positions(model)))record(before);else controls();},
      cancel,
      undo(){if(active||!undo.length)return;redo.push(positions(model));apply(undo.pop());persist();},
      redo(){if(active||!redo.length)return;undo.push(positions(model));apply(redo.pop());persist();},
      reset(){if(active)return;const before=positions(model);if(same(before,basePositions()))return;apply(basePositions());record(before);onMessage('Przywrócono początkowy układ. Możesz cofnąć tę zmianę.');},
      toggle(){cancel();enabled=!enabled;if(!window.GenealogyResponsive?.mobile)desktopEnabled=enabled;persist();controls();},
      setMobile(mobile){cancel();enabled=mobile?false:desktopEnabled;controls();},
      refresh(){
        const next=fingerprint(model),old=positionsFromCache();
        base={nodes:clone(model.nodes),edges:clone(model.edges),width:model.width,height:model.height};
        if(next!==signature){archive({version:2,signature,positions:old||positions(model),enabled});signature=next;undo=[];redo=[];active=null;apply(basePositions());persist();}
        else{apply(old&&valid(old)?old:basePositions());}
      }
    };
    // Position history is separate from the person editor and canonical family data.
    const migrated=!model.layoutPolicy&&cache&&cache.signature!==signature?window.GenealogyCardView?.migratePlacement(cache,model):null;
    if(cache&&(cache.signature!==signature||!valid(cache.positions)))archive(cache);
    let latest=cache?.signature===signature&&valid(cache.positions)?cache.positions:migrated&&valid(migrated)?migrated:null;
    function positionsFromCache(){return latest;}
    const change=onChange;onChange=()=>{latest=positions(model);change();};
    document.getElementById('download-layout-backup').onclick=()=>{if(!previous)return;window.GenealogyResponsive?.closeMenu?.();try{const backup=history.length?{version:1,latest:previous,history}:previous;const url=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=history.length?'family-layout-backups.json':'family-layout-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch{onMessage('Nie udało się pobrać kopii układu. Wcześniejsza kopia pozostaje w przeglądarce.');}};
    document.getElementById('mobile-layout-exit').onclick=()=>api.toggle();
    toggle.onclick=()=>api.toggle();undoButton.onclick=()=>api.undo();redoButton.onclick=()=>api.redo();resetButton.onclick=()=>api.reset();
    document.addEventListener('keydown',event=>{
      if(event.defaultPrevented||document.querySelector('dialog[open]')||event.target.closest('input,textarea,select,[contenteditable="true"]'))return;
      if(!(event.metaKey||event.ctrlKey))return;
      const code=event.key.toLowerCase();if(code==='z'){event.preventDefault();event.shiftKey?api.redo():api.undo();}else if(code==='y'){event.preventDefault();api.redo();}
    });
    apply(latest||basePositions());
    return api;
  }
  return{create,resolveRow,routeEdges,constrained};
})();

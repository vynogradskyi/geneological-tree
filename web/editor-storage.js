/* Persistence: project API when available; IndexedDB + ZIP for standalone HTML. */
window.GenealogyStorage = (() => {
  const clone = value => structuredClone(value);
  const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  async function hash(text) {
    const data = typeof text === 'string' ? new TextEncoder().encode(text) : text;
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  const today = () => new Intl.DateTimeFormat('pl-PL',{timeZone:'Europe/Warsaw'}).format(new Date());
  function database() {
    return new Promise((resolve,reject)=>{const request=indexedDB.open('genealogy-editor',1);request.onupgradeneeded=()=>request.result.createObjectStore('snapshots');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('Nie można otworzyć pamięci przeglądarki. Uruchom lokalny edytor projektu.'));});
  }
  async function get(db,key) {return new Promise((resolve,reject)=>{const tx=db.transaction('snapshots');const r=tx.objectStore('snapshots').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
  async function put(db,key,value) {return new Promise((resolve,reject)=>{const tx=db.transaction('snapshots','readwrite');tx.objectStore('snapshots').put(value,key);tx.oncomplete=resolve;tx.onerror=()=>reject(new Error('Brak miejsca na zapis. Pobierz zmiany lub uruchom edytor projektu.'));tx.onabort=()=>reject(new Error('Zapis w przeglądarce nie powiódł się.'));});}
  function download(blob,name) {const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
  function photoSource(state,p) {return state.photoData?.[p.photo] || p.photo;}
  async function thumbnail(dataUrl) {
    const image=new Image();image.src=dataUrl;await image.decode();
    if(image.naturalWidth*image.naturalHeight>65000000)throw Error('Zdjęcie jest zbyt duże; wybierz wersję do 65 megapikseli.');
    const s=Math.min(1,360/image.naturalWidth,480/image.naturalHeight),canvas=document.createElement('canvas');canvas.width=Math.round(image.naturalWidth*s);canvas.height=Math.round(image.naturalHeight*s);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/jpeg',.87);
  }
  async function relayout(state) {
    const data=state.data,P=new Map(data.people.map(p=>[p.id,p])),links=new Map(data.people.map(p=>[p.id,[]]));
    const connect=(a,b,delta)=>{links.get(a).push([b,delta]);links.get(b).push([a,-delta]);};
    for(const p of P.values()){for(const field of ['Mommy','Daddy'])if(p[field])connect(p.id,p[field],1);for(const sibling of p.siblings)connect(p.id,sibling,0);}
    for(const r of data.relationships)connect(...r.personIds,0);
    const ranks={},branch={};
    function rankComponent(root){ranks[root]=0;const queue=[root];for(let i=0;i<queue.length;i++){const a=queue[i];for(const[b,delta]of links.get(a)){if(ranks[b]===undefined){ranks[b]=ranks[a]+delta;queue.push(b);}else if(ranks[b]!==ranks[a]+delta)throw Error('Powiązania wskazują sprzeczne pokolenia. Sprawdź rodziców i rodzeństwo.');}}}
    rankComponent(data.rootPersonId);state.disconnectedPeople=[...P.keys()].filter(id=>ranks[id]===undefined);for(const id of P.keys())if(ranks[id]===undefined)rankComponent(id);
    const direct=new Set();function ancestors(id,set){if(!id||set.has(id))return;set.add(id);for(const field of ['Mommy','Daddy'])ancestors(P.get(id)[field],set);}
    ancestors(data.rootPersonId,direct);const paternal=new Set(),maternal=new Set();ancestors(P.get(data.rootPersonId).Daddy,paternal);ancestors(P.get(data.rootPersonId).Mommy,maternal);
    for(const id of paternal)branch[id]='father';for(const id of maternal)branch[id]='mother';branch[data.rootPersonId]='root';const queue=[...Object.keys(branch).filter(id=>branch[id]!=='root')];for(let i=0;i<queue.length;i++)for(const[id]of links.get(queue[i]))if(!branch[id]){branch[id]=branch[queue[i]];queue.push(id);}for(const id of P.keys())branch[id]||='other';
    const min=Math.min(...Object.values(ranks)),max=Math.max(...Object.values(ranks)),rows=new Map(),q=JSON.stringify,dot=['digraph tree {','graph [rankdir=TB,splines=spline,nodesep=0.21,ranksep=0.47,newrank=true,bgcolor="transparent"];',`node [shape=box,fixedsize=true,label="",width=${GenealogyCardMetrics.width/72},height=${GenealogyCardMetrics.height/72}];`,'edge [arrowhead=none];'];
    const addRow=(level,id)=>{if(!rows.has(level))rows.set(level,[]);rows.get(level).push(id);};
    for(const id of P.keys()){dot.push(q(id)+';');addRow(2*ranks[id],id);}
    const families=new Map();for(const p of P.values())if(p.Daddy||p.Mommy){const key=q([p.Daddy,p.Mommy]);if(!families.has(key))families.set(key,{dad:p.Daddy,mom:p.Mommy,children:[]});families.get(key).children.push(p.id);}
    const familyList=[...families.values()];
    familyList.forEach((f,i)=>{const id='family_'+i;f.id=id;dot.push(`${q(id)} [shape=point,width=.045,height=.045,label=""];`);addRow(2*ranks[f.dad||f.mom]-1,id);for(const parent of [f.dad,f.mom].filter(Boolean))dot.push(`${q(parent)} -> ${q(id)} [kind="parent",tailport=s];`);for(const child of f.children)dot.push(`${q(id)} -> ${q(child)} [kind="parent",headport=n];`);if(f.dad&&f.mom)dot.push(`${q(f.dad)} -> ${q(f.mom)} [style=invis,weight=100];`);});
    const seen=new Set();for(const p of P.values())for(const id of p.siblings){const key=[id,p.id].sort().join('/');if(seen.has(key))continue;seen.add(key);const other=P.get(id);if(![p.Mommy,p.Daddy].filter(Boolean).some(parent=>parent===other.Mommy||parent===other.Daddy))dot.push(`${q(p.id)} -> ${q(id)} [kind="sibling",constraint=false,style=dashed];`);}
    for(const r of data.relationships){const label=r.status==='rozwiedzeni'?'rozwód':r.previousRelationshipId?'późniejsze małżeństwo':'małżeństwo';dot.push(`${q(r.personIds[0])} -> ${q(r.personIds[1])} [kind="marriage",constraint=false,style=dotted,label=${q(label)},fontsize=11];`);}
    for(const side of ['father','mother','other']){dot.push(`subgraph cluster_${side} {style=invis;`);for(const id of P.keys())if(branch[id]===side)dot.push(q(id)+';');for(const f of familyList){const parents=[f.dad,f.mom].filter(Boolean);if(parents.every(id=>branch[id]===side))dot.push(q(f.id)+';');}if(side==='father')for(const[name,members]of [['natalja',['person_0026','person_0027','person_0028','person_0029']],['siergiej',['person_0040','person_0041']]]){if(!members.every(id=>branch[id]===side))continue;dot.push(`subgraph cluster_${name} {style=invis;`);members.forEach(id=>dot.push(q(id)+';'));for(const f of familyList)if([f.dad,f.mom].filter(Boolean).every(id=>members.includes(id))&&f.children.every(id=>members.includes(id)))dot.push(q(f.id)+';');dot.push('}');}dot.push('}');}
    for(let level=2*max;level>=2*min;level--){const anchor='anchor_'+level;dot.push(`${q(anchor)} [shape=point,width=0,height=0,style=invis];`);dot.push('{rank=same;'+[anchor,...rows.get(level)||[]].map(q).join(';')+';}');if(level<2*max)dot.push(`${q('anchor_'+(level+1))} -> ${q(anchor)} [style=invis,weight=100];`);}dot.push('}');
    const viz=await Viz.instance(),graph=viz.renderJSON(dot.join('\n')),height=Number(graph.bb.split(',')[3]),width=Number(graph.bb.split(',')[2]);const objects=new Map(graph.objects.map(o=>[o._gvid,o]));state.nodes={};state.edges=[];
    for(const o of graph.objects)if(P.has(o.name)&&o.pos){const[x,y]=o.pos.split(',').map(Number),w=Number(o.width)*72,h=Number(o.height)*72;state.nodes[o.name]={x:x-w/2,y:height-y-h/2,w,h};}
    for(const edge of graph.edges){if(edge.style==='invis'||!edge.kind)continue;state.edges.push({kind:edge.kind,paths:(edge._draw_||[]).filter(d=>d.op==='b').map(d=>d.points.map(([x,y])=>[x,height-y])),labels:(edge._ldraw_||[]).filter(d=>d.op==='T').map(d=>({text:d.text,x:d.pt[0],y:height-d.pt[1]})),tail:objects.get(edge.tail).name,head:objects.get(edge.head).name});}
    Object.assign(state,{width,height,ranks,branches:branch,direct:[...direct],generations:max-min+1});
  }
  async function open(seed, options = {}) {
    let token=null;
    if(!options.browserOnly&&location.protocol==='http:'&&['127.0.0.1','localhost'].includes(location.hostname)){
      try{const response=await fetch('api/state',{signal:AbortSignal.timeout(2500),cache:'no-store'});if(response.ok){const result=await response.json();token=result.token;return{mode:'project',state:result.state,photoSource:p=>p.photo,async save(request){const response=await fetch('api/person',{method:'POST',headers:{'Content-Type':'application/json','X-Editor-Token':token},body:JSON.stringify(request)});const result=await response.json();if(!response.ok)throw Error(result.error||'Nie udało się zapisać.');this.state=result.state;return this.state;}};}}catch(error){console.info('Tryb samodzielnego HTML:',error.message);}
    }
    let db=null,cache=null;const key=location.pathname.replace(/[^/]*$/,'')+seed.data.rootPersonId+(options.account?':family:'+options.account:'');
    try{db=await database();cache=await get(db,key);}catch(error){console.info(error.message);}
    const baseHash=seed.sourceSha256+':'+(seed.translationSha256||'');
    const stale=cache&&cache.baseHash!==baseHash;
    const state=cache&&!stale?cache.state:clone(seed);state.photoData||={};
    return{mode:'browser',state,staleBackup:stale?cache.state:null,async save(request){
      if(!db)throw Error('Pamięć przeglądarki jest niedostępna. Uruchom plik „Uruchom edytor.command”, aby zapisywać w projekcie.');
      const latest=await get(db,key);if(latest&&latest.baseHash===baseHash&&!same([latest.state.data,latest.state.translations],[this.state.data,this.state.translations]))throw Error('Dane zmieniły się w innym oknie. Odśwież stronę przed zapisaniem.');
      const next=clone(this.state),p=clone(request.person),old=next.data.people.find(p=>p.id===request.person.id);
      if(request.photo){const dataUrl=request.photo.dataUrl;const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'}[dataUrl.split(';')[0].split(':')[1]];if(!ext)throw Error('Wybierz zdjęcie JPG, PNG, WebP lub GIF.');p.photo=`photos/${p.id}_${(await hash(dataUrl)).slice(0,12)}.${ext}`;next.photoData[p.photo]=dataUrl;next.thumbnails[p.id]=await thumbnail(dataUrl);}else if(request.removePhoto){p.photo=null;delete next.thumbnails[p.id];}
      next.data.people=next.data.people.map(other=>{if(other.id===p.id)return p;if(p.siblings.includes(other.id)&&!other.siblings.includes(p.id))other.siblings.push(p.id);if(!p.siblings.includes(other.id))other.siblings=other.siblings.filter(id=>id!==p.id);return other;});
      const oldMarriages=next.data.relationships.filter(r=>r.personIds.includes(p.id)),replacements=new Map(request.marriages.map(r=>[r.id,r])),originalIds=new Set(next.data.relationships.map(r=>r.id));next.data.relationships=next.data.relationships.filter(r=>!r.personIds.includes(p.id)||replacements.has(r.id)).map(r=>replacements.get(r.id)||r).concat(request.marriages.filter(r=>!originalIds.has(r.id)));
      if(!same([old.Mommy,old.Daddy,old.siblings,oldMarriages],[p.Mommy,p.Daddy,p.siblings,request.marriages]))await relayout(next);
      if(request.translation){next.translations||={};const entry=request.translation;next.translations[entry.language]||={language:entry.language,people:{},issues:{}};next.translations[entry.language].people[p.id]={source:entry.source,values:entry.values};}
      next.updatedOn=today();next.sourceSha256=await hash(JSON.stringify(next.data,null,2)+'\n');await put(db,key,{baseHash,state:next,savedAt:new Date().toISOString()});this.state=next;return next;
    },async exportChanges(useStale=false){const value=useStale?this.staleBackup:this.state,zip=new JSZip();zip.file('family-tree.json',JSON.stringify(value.data,null,2)+'\n');zip.file('family-translations.json',JSON.stringify(value.translations||{},null,2)+'\n');for(const[path,url]of Object.entries(value.photoData||{}))zip.file(path,url.split(',')[1],{base64:true});const portable=clone(value);delete portable.photoData;zip.file('web/family-data.js','window.GENEALOGY = '+JSON.stringify(portable).replace(/</g,'\\u003c')+';\n');zip.file('data/tree.json',JSON.stringify(portable)+'\n');for(const lang of ['pl','ru','en'])zip.file('data/tree.'+lang+'.json',JSON.stringify(value.translations?.[lang]||{language:lang,people:{},issues:{}})+'\n');zip.file('JAK-ZAPISAC.txt','Archiwum zawiera zmienione dane i nowe zdjęcia. Rozpakuj je w dotychczasowym folderze projektu, zastępując family-tree.json, family-translations.json, data/tree*.json i web/family-data.js. Stare zdjęcia pozostają w photos/.\n');download(await zip.generateAsync({type:'blob'}),'zmiany-drzewa.zip');}};
  }
  return{open,photoSource,thumbnail};
})();

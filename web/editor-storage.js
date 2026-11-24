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
  async function commit(db,key,expectedToken,record,archive){
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('snapshots','readwrite'),store=tx.objectStore('snapshots');let failure=null;
      const get=store.get(key);get.onsuccess=()=>{const previous=get.result,token=previous?.writeToken||previous?.savedAt||null;
        if(token!==expectedToken){failure=Error('Dane zmieniły się w innym oknie. Odśwież stronę przed zapisaniem.');tx.abort();return;}
        if(archive)store.put(archive.record,archive.key);store.put(record,key);
      };
      tx.oncomplete=resolve;tx.onerror=()=>reject(failure||Error('Brak miejsca na zapis. Pobierz zmiany lub uruchom edytor projektu.'));tx.onabort=()=>reject(failure||Error('Zapis w przeglądarce nie powiódł się.'));
    });
  }
  function download(blob,name) {const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
  function photoSource(state,p) {return state.photoData?.[p.photo] || p.photo;}
  async function thumbnail(dataUrl) {
    const image=new Image();image.src=dataUrl;await image.decode();
    if(image.naturalWidth*image.naturalHeight>65000000)throw Error('Zdjęcie jest zbyt duże; wybierz wersję do 65 megapikseli.');
    const s=Math.min(1,360/image.naturalWidth,480/image.naturalHeight),canvas=document.createElement('canvas');canvas.width=Math.round(image.naturalWidth*s);canvas.height=Math.round(image.naturalHeight*s);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/jpeg',.87);
  }
  async function relayout(state){Object.assign(state,GenealogyFamilyLayout.create(state.data));}
  async function open(seed, options = {}) {
    let token=null;
    if(!options.browserOnly&&location.protocol==='http:'&&['127.0.0.1','localhost'].includes(location.hostname)){
      try{const response=await fetch('api/state',{signal:AbortSignal.timeout(2500),cache:'no-store'});if(response.ok){const result=await response.json();token=result.token;return{mode:'project',state:result.state,photoSource:p=>p.photo,async save(request){const response=await fetch('api/person',{method:'POST',headers:{'Content-Type':'application/json','X-Editor-Token':token},body:JSON.stringify(request)});const result=await response.json();if(!response.ok)throw Error(result.error||'Nie udało się zapisać.');this.state=result.state;return this.state;}};}}catch(error){console.info('Tryb samodzielnego HTML:',error.message);}
    }
    let db=null,cache=null;const key=location.pathname.replace(/[^/]*$/,'')+seed.data.rootPersonId+(options.account?':family:'+options.account:'');
    try{db=await database();cache=await get(db,key);}catch(error){console.info(error.message);}
    const baseHash=seed.sourceSha256+':'+(seed.translationSha256||'');
    let stale=cache&&cache.baseHash!==baseHash;
    const backupKey=stale?key+':archive:'+(cache.savedAt||cache.baseHash):cache?.backupKey;
    const backup=stale?cache:backupKey&&db?await get(db,backupKey):null;
    let expectedToken=cache?.writeToken||cache?.savedAt||null;
    const state=cache&&!stale?cache.state:clone(seed);state.photoData||={};
    return{mode:'browser',state,staleBackup:backup?.state||null,async save(request){
      if(!db)throw Error('Pamięć przeglądarki jest niedostępna. Uruchom plik „Uruchom edytor.command”, aby zapisywać w projekcie.');
      const next=clone(this.state),p=clone(request.person),old=next.data.people.find(p=>p.id===request.person.id);
      if(request.photo){const dataUrl=request.photo.dataUrl;const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'}[dataUrl.split(';')[0].split(':')[1]];if(!ext)throw Error('Wybierz zdjęcie JPG, PNG, WebP lub GIF.');p.photo=`photos/${p.id}_${(await hash(dataUrl)).slice(0,12)}.${ext}`;next.photoData[p.photo]=dataUrl;next.thumbnails[p.id]=await thumbnail(dataUrl);}else if(request.removePhoto){p.photo=null;delete next.thumbnails[p.id];}
      next.data.people=next.data.people.map(other=>{if(other.id===p.id)return p;if(p.siblings.includes(other.id)&&!other.siblings.includes(p.id))other.siblings.push(p.id);if(!p.siblings.includes(other.id))other.siblings=other.siblings.filter(id=>id!==p.id);return other;});
      const oldMarriages=next.data.relationships.filter(r=>r.personIds.includes(p.id)),replacements=new Map(request.marriages.map(r=>[r.id,r])),originalIds=new Set(next.data.relationships.map(r=>r.id));next.data.relationships=next.data.relationships.filter(r=>!r.personIds.includes(p.id)||replacements.has(r.id)).map(r=>replacements.get(r.id)||r).concat(request.marriages.filter(r=>!originalIds.has(r.id)));
      if(!same([old.Mommy,old.Daddy,old.siblings,oldMarriages],[p.Mommy,p.Daddy,p.siblings,request.marriages]))await relayout(next);
      if(request.translation){next.translations||={};const entry=request.translation;next.translations[entry.language]||={language:entry.language,people:{},issues:{}};const previous=next.translations[entry.language].people[p.id]||{source:{},values:{}};for(const field of Object.keys(entry.values)){previous.source[field]=clone(entry.source[field]);previous.values[field]=clone(entry.values[field]);}next.translations[entry.language].people[p.id]=previous;}
      next.updatedOn=today();next.sourceSha256=await hash(JSON.stringify(next.data,null,2)+'\n');const writeToken=crypto.randomUUID();await commit(db,key,expectedToken,{baseHash,state:next,savedAt:new Date().toISOString(),writeToken,backupKey},stale?{key:backupKey,record:cache}:null);expectedToken=writeToken;stale=false;this.state=next;return next;
    },async exportChanges(useStale=false){const value=useStale?this.staleBackup:this.state,zip=new JSZip();zip.file('family-tree.json',JSON.stringify(value.data,null,2)+'\n');zip.file('family-translations.json',JSON.stringify(value.translations||{},null,2)+'\n');for(const[path,url]of Object.entries(value.photoData||{}))zip.file(path,url.split(',')[1],{base64:true});const portable=clone(value);delete portable.photoData;zip.file('web/family-data.js','window.GENEALOGY = '+JSON.stringify(portable).replace(/</g,'\\u003c')+';\n');zip.file('data/tree.json',JSON.stringify(portable)+'\n');for(const lang of ['pl','ru','en'])zip.file('data/tree.'+lang+'.json',JSON.stringify(value.translations?.[lang]||{language:lang,people:{},issues:{}})+'\n');zip.file('JAK-ZAPISAC.txt','Archiwum zawiera zmienione dane i nowe zdjęcia. Rozpakuj je w dotychczasowym folderze projektu, zastępując family-tree.json, family-translations.json, data/tree*.json i web/family-data.js. Stare zdjęcia pozostają w photos/.\n');download(await zip.generateAsync({type:'blob'}),'zmiany-drzewa.zip');}};
  }
  return{open,photoSource,thumbnail};
})();

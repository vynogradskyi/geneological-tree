(async () => {
  'use strict';
  const seed = await (window.GENEALOGY_READY || Promise.resolve(window.GENEALOGY));
  const family=window.GenealogyFamily;
  let familyUser=family?.enabled?await family.ready():null;
  let activeStorage=family?.enabled&&!familyUser?{mode:'readonly',state:structuredClone(seed)}:await GenealogyStorage.open(seed,{browserOnly:family?.enabled,account:familyUser?.login});
  const storage=new Proxy({}, {get:(_,key)=>typeof activeStorage[key]==='function'?activeStorage[key].bind(activeStorage):activeStorage[key]});
  const G = structuredClone(storage.state);
  window.GENEALOGY = G;
  const people = new Map(G.data.people.map(p => [p.id, p]));
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normal = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ł/g,'l').replace(/Ł/g,'L').toLowerCase();
  const fullName = p => [p.firstName || 'Imię nieznane', p.lastName].filter(Boolean).join(' ');
  const shortName = p => p.id === 'person_0038' && !p.firstName ? 'Matka Anny · imię nieznane' : fullName(p);
  const date = value => GenealogyDates.date(value);
  const life = p => GenealogyDates.life(p);
  const photoSource = p => GenealogyStorage.photoSource(G,p);
  const place = value => value ? [value.city, value.region, value.country].filter(Boolean).join(', ') || 'nieznane' : 'nieznane';
  const extraLines = p => [p.maidenName ? `z domu ${p.maidenName}` : '', p.formerLastNames.length ? `poprz. ${p.formerLastNames.join(', ')}` : '', p.title || '', p.occupation || '', p.deathCircumstances || ''].filter(Boolean);
  const pathData = points => `M ${points[0].join(' ')} C ${points.slice(1).map(p => p.join(' ')).join(' ')}`;
  const viewport = $('viewport'), world = $('world'), personDialog = $('person-dialog'), photoDialog = $('photo-dialog');
  const state = {scale:1,x:0,y:0,selected:null};
  const svg = $('connections'), personButtons = new Map();
  function paintConnections(){
    svg.replaceChildren();
  for (const edge of G.edges) {
    for (const points of edge.paths) {
      const path = document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d',pathData(points)); path.setAttribute('class',`connection ${edge.kind}`);svg.append(path);
    }
    for (const label of edge.labels) {
      const text = document.createElementNS('http://www.w3.org/2000/svg','text');
      text.setAttribute('x',label.x);text.setAttribute('y',label.y);text.setAttribute('text-anchor','middle');text.setAttribute('class','edge-label');text.textContent=label.text;svg.append(text);
    }
  }
  }
  function updateLayoutView(){
    world.style.width=G.width+'px';world.style.height=G.height+'px';svg.setAttribute('width',G.width);svg.setAttribute('height',G.height);
    for(const[id,node]of Object.entries(G.nodes)){const button=personButtons.get(id);if(button)button.style.left=node.x+'px';}
    paintConnections();
  }
  function drawTree(){
    svg.replaceChildren();$('people').replaceChildren();personButtons.clear();
  world.style.width = G.width+'px'; world.style.height = G.height+'px';
  svg.setAttribute('width',G.width); svg.setAttribute('height',G.height);
  paintConnections();
  for (const p of people.values()) {
    const pos=G.nodes[p.id],button=document.createElement('button');
    button.type='button';button.className=`person-node branch-${G.branches[p.id]}`;button.dataset.person=p.id;
    Object.assign(button.style,{left:pos.x+'px',top:pos.y+'px'});
    button.setAttribute('aria-label',`${shortName(p)}, ${life(p)}. Otwórz szczegóły`);
    const initials=[p.firstName?.[0],p.lastName?.[0]].filter(Boolean).join('') || '?';
    const image=G.thumbnails[p.id] ? `<img class="node-photo" src="${G.thumbnails[p.id]}" alt="" draggable="false">` : `<span class="node-photo node-placeholder"><b>${esc(initials)}</b><span>brak zdjęcia</span></span>`;
    const subtitles=extraLines(p);
    button.innerHTML=image+`<span class="node-name">${esc(p.id==='person_0038'&&!p.firstName?'Matka Anny':p.firstName || 'Imię nieznane')}</span>`+`<span class="node-name">${esc(p.lastName || (p.id==='person_0038'&&!p.firstName?'imię nieznane':p.title || ''))}</span>`+(subtitles.length?`<span class="node-subtitle">${esc(subtitles.filter(s=>s!==p.title).slice(0,2).join(' · '))}</span>`:'')+`<span class="node-dates">${esc(life(p))}</span>`;
    button.addEventListener('click',()=>{if(!dragWasMoved)openPerson(p.id);});
    $('people').append(button);personButtons.set(p.id,button);
  }
  const author=fullName(people.get(G.data.rootPersonId));$('author-name').textContent=author;$('go-root').textContent=people.get(G.data.rootPersonId).firstName||'Osoba główna';document.title='Moje drzewo genealogiczne · '+author;
  $('summary').textContent=`${people.size} osób · ${G.generations} pokoleń`;
  $('updated-on').textContent=G.updatedOn;
  }
  drawTree();
  let activeCard=null;
  const cardLayout=GenealogyCardLayout.create({model:G,onChange:updateLayoutView,onMessage:message,onActiveChange:id=>{if(activeCard)personButtons.get(activeCard)?.classList.remove('is-dragging');activeCard=id;if(id)personButtons.get(id)?.classList.add('is-dragging');viewport.classList.toggle('card-drag-active',!!id);}});
  function transform(){world.style.transform=`translate(${state.x}px,${state.y}px) scale(${state.scale})`;$('zoom-label').textContent=Math.round(state.scale*100)+'%';}
  function focusPerson(id, scale=1){const n=G.nodes[id];state.scale=scale;state.x=viewport.clientWidth/2-(n.x+n.w/2)*scale;state.y=viewport.clientHeight*.72-(n.y+n.h/2)*scale;transform();}
  function zoom(factor,x=viewport.clientWidth/2,y=viewport.clientHeight/2){const old=state.scale;state.scale=Math.max(.12,Math.min(2.5,old*factor));state.x=x-(x-state.x)*state.scale/old;state.y=y-(y-state.y)*state.scale/old;transform();}
  $('zoom-in').onclick=()=>zoom(1.25);$('zoom-out').onclick=()=>zoom(.8);
  function goRoot(){
    if(viewport.clientWidth>=600){focusPerson(G.data.rootPersonId,1);return;}
    const p=people.get(G.data.rootPersonId),nodes=[p.id,p.Mommy,p.Daddy].filter(Boolean).map(id=>G.nodes[id]);
    const left=Math.min(...nodes.map(n=>n.x)),right=Math.max(...nodes.map(n=>n.x+n.w));
    const root=G.nodes[p.id];state.scale=Math.min(.9,(viewport.clientWidth-34)/(right-left));
    state.x=(viewport.clientWidth-(right-left)*state.scale)/2-left*state.scale;state.y=viewport.clientHeight*.72-(root.y+root.h/2)*state.scale;transform();
  }
  $('go-root').onclick=goRoot;
  $('fit-tree').onclick=()=>{state.scale=Math.max(.08,Math.min((viewport.clientWidth-50)/G.width,(viewport.clientHeight-70)/G.height));state.x=(viewport.clientWidth-G.width*state.scale)/2;state.y=(viewport.clientHeight-G.height*state.scale)/2+12;transform();};
  let drag=null,dragWasMoved=false;
  const pointers=new Map();let pinch=null;
  viewport.addEventListener('pointerdown',e=>{
    if(e.button!==0)return;
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    const card=e.target.closest('.person-node'),canMove=card&&cardLayout.isEnabled()&&e.pointerType==='mouse';
    drag={id:e.pointerId,startX:e.clientX,startY:e.clientY,x:state.x,y:state.y,mode:canMove?'card':'pan',person:canMove?card.dataset.person:null,cardX:canMove?G.nodes[card.dataset.person].x:null};
    dragWasMoved=false;
    if(pointers.size===2){if(cardLayout.isDragging())cardLayout.cancel();const[a,b]=[...pointers.values()];pinch={distance:Math.hypot(a.x-b.x,a.y-b.y),scale:state.scale};drag.mode='pan';}
    if(!card)viewport.setPointerCapture(e.pointerId);
  });
  viewport.addEventListener('pointermove',e=>{
    if(!pointers.has(e.pointerId))return;
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pinch&&pointers.size===2){const[a,b]=[...pointers.values()];const distance=Math.hypot(a.x-b.x,a.y-b.y),rect=viewport.getBoundingClientRect();zoom((pinch.scale*distance/pinch.distance)/state.scale,(a.x+b.x)/2-rect.left,(a.y+b.y)/2-rect.top);dragWasMoved=true;return;}
    if(!drag||drag.id!==e.pointerId)return;
    const dx=e.clientX-drag.startX,dy=e.clientY-drag.startY;
    if(Math.hypot(dx,dy)>6)dragWasMoved=true;
    if(!dragWasMoved)return;
    if(drag.mode==='card'&&!cardLayout.isDragging()&&Math.abs(dx)<=6)return;
    if(!viewport.hasPointerCapture(e.pointerId))viewport.setPointerCapture(e.pointerId);
    if(drag.mode==='card'){
      if(!cardLayout.isDragging())cardLayout.start(drag.person);
      cardLayout.move(drag.cardX+dx/state.scale);
      e.preventDefault();
    }else{state.x=drag.x+dx;state.y=drag.y+dy;viewport.classList.add('dragging');transform();}
  });
  function stopDrag(e,cancel=false){
    if(drag?.id===e.pointerId&&drag.mode==='card'&&cardLayout.isDragging())cancel?cardLayout.cancel():cardLayout.finish();
    pointers.delete(e.pointerId);pinch=null;drag=null;viewport.classList.remove('dragging');
    if(viewport.hasPointerCapture(e.pointerId))viewport.releasePointerCapture(e.pointerId);
    setTimeout(()=>{dragWasMoved=false;},0);
  }
  viewport.addEventListener('pointerup',e=>stopDrag(e));
  viewport.addEventListener('pointercancel',e=>stopDrag(e,true));
  viewport.addEventListener('lostpointercapture',e=>{if(drag?.id===e.pointerId)stopDrag(e,true);});
  window.addEventListener('blur',()=>{if(drag)stopDrag({pointerId:drag.id},true);});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&drag?.mode==='card'){stopDrag({pointerId:drag.id},true);e.preventDefault();}});
  viewport.addEventListener('wheel',e=>{e.preventDefault();if(cardLayout.isDragging())return;const r=viewport.getBoundingClientRect();if(e.ctrlKey||e.metaKey){zoom(Math.exp(-e.deltaY*.008),e.clientX-r.left,e.clientY-r.top);}else{state.x-=e.deltaX;state.y-=e.deltaY;transform();}},{passive:false});
  function relationButton(id){const p=people.get(id);return `<button class="relative-link" type="button" data-relative="${id}">${esc(shortName(p))}${p.birthYear?` <small>(${p.birthYear})</small>`:''}</button>`;}
  function relativeRow(label, ids){return `<div class="relative-row"><span>${esc(label)}</span><div class="relative-list">${ids.length?ids.map(relationButton).join(''):'<span class="unknown">brak danych</span>'}</div></div>`;}
  function linkify(text){return esc(text).replace(/https?:\/\/[^\s<>]+/g,url=>{const clean=url.replace(/[.,;]$/,'');return `<a href="${clean}" target="_blank" rel="noopener noreferrer">${clean}</a>`+url.slice(clean.length);});}
  let onPersonView = () => {};
  function openPerson(id){
    onPersonView();
    const p=people.get(id);state.selected=id;
    for(const[pid,button]of personButtons)button.classList.toggle('selected',pid===id);
    const children=[...people.values()].filter(c=>c.Mommy===id||c.Daddy===id).map(c=>c.id);
    const siblings=new Set(p.siblings);
    for(const other of people.values())if(other.id!==id&&((p.Mommy&&other.Mommy===p.Mommy)||(p.Daddy&&other.Daddy===p.Daddy)))siblings.add(other.id);
    const marriages=G.data.relationships.filter(r=>r.personIds.includes(id));
    const spouseIds=marriages.map(r=>r.personIds.find(pid=>pid!==id));
    const issues=G.issues.filter(q=>q.personIds?.includes(id));
    const portrait=p.photo?`<button class="portrait-button" type="button" id="enlarge-portrait" aria-label="Powiększ zdjęcie ${esc(fullName(p))}"><img src="${esc(photoSource(p))}" alt="Portret: ${esc(fullName(p))}"><span>Powiększ zdjęcie</span></button>`:`<div class="detail-initials">${esc(p.firstName?.[0]||'?')}</div>`;
    const status=p.isLiving===true?'żyje':p.isLiving===false?'osoba zmarła':'nieustalony';
    const facts=[['Data urodzenia',GenealogyDates.part(p,'birth')],['Miejsce urodzenia',place(p.birthPlace)],['Status życia',status],['Data śmierci',GenealogyDates.part(p,'death')],['Miejsce śmierci',place(p.deathPlace)]];
    if(!p.lastName)facts.unshift(['Nazwisko','nieznane']);
    if(p.deathCircumstances)facts.push(['Okoliczności śmierci',p.deathCircumstances]);
    if(p.patronymic)facts.push(['Imię odojcowskie',p.patronymic]);
    if(p.formerLastNames.length)facts.push(['Poprzednie nazwiska',p.formerLastNames.join(', ')]);
    $('person-details').innerHTML=`<section class="details-hero">${portrait}<h2 id="person-name">${esc(shortName(p))}</h2>${p.maidenName?`<p class="detail-subtitle">z domu ${esc(p.maidenName)}</p>`:''}${[p.title,p.occupation].filter(Boolean).map(t=>`<span class="role-label">${esc(t)}</span>`).join('')}${G.disconnectedPeople?.includes(p.id)?'<p class="issue">Brak ustalonego połączenia z osobą główną. Sprawdź powiązania rodzinne.</p>':''}</section>`+
      `<section class="details-section"><h3>Życie</h3><dl class="facts">${facts.map(([label,value])=>`<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`).join('')}</dl></section>`+
      `<section class="details-section"><h3>Rodzina</h3>${relativeRow('Matka',p.Mommy?[p.Mommy]:[])}${relativeRow('Ojciec',p.Daddy?[p.Daddy]:[])}${relativeRow('Małżeństwa',spouseIds)}${relativeRow('Dzieci',children)}${relativeRow('Rodzeństwo',[...siblings])}${marriages.filter(r=>r.status==='rozwiedzeni').map(r=>`<p class="photo-credit">Rozwód: ${esc(fullName(people.get(r.personIds.find(pid=>pid!==id))))}.</p>`).join('')}</section>`+
      (p.notes?`<section class="details-section"><h3>Historia i uwagi</h3><p class="notes">${esc(p.notes)}</p></section>`:'')+
      (issues.length?`<section class="details-section"><h3>Do wyjaśnienia</h3>${issues.map(q=>`<p class="issue">${esc(q.question||q.topic)}</p>`).join('')}</section>`:'')+
      `<section class="details-section"><h3>Źródła informacji</h3><ol class="sources">${p.sources.map(s=>`<li>${linkify(s)}</li>`).join('')}</ol>${G.credits.filter(c=>c.personId===id).map(c=>`<p class="photo-credit">Wcześniej wskazane źródło zdjęcia: <a href="${esc(c.sourcePage)}" target="_blank" rel="noopener noreferrer">${esc(c.author)}</a> · <a href="${esc(c.licenseUrl)}" target="_blank" rel="noopener noreferrer">${esc(c.license)}</a>. Obecny plik dostarczony przez użytkownika.</p>`).join('')}</section>`;
    $('person-details').querySelectorAll('[data-relative]').forEach(button=>button.onclick=()=>{const next=button.dataset.relative;focusPerson(next,state.scale<.65?.9:state.scale);openPerson(next);});
    if(p.photo)$('enlarge-portrait').onclick=()=>{$('full-photo').src=photoSource(p);$('full-photo').alt=fullName(p);photoDialog.showModal();};
    if(!personDialog.open)personDialog.showModal();personDialog.scrollTop=0;
    $('announcer').textContent='Otwarta karta: '+fullName(p);
  }
  $('close-person').onclick=()=>personDialog.close();$('close-photo').onclick=()=>photoDialog.close();
  for(const dialog of [personDialog,photoDialog])dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
  let toastTimer;
  function message(text){clearTimeout(toastTimer);const box=$('export-message');box.textContent=text;box.hidden=false;const status=$('person-status');if(personDialog.open){status.textContent=text;status.hidden=false;}toastTimer=setTimeout(()=>{box.hidden=true;status.hidden=true;},7000);}
  let editor;
  if(storage.mode==='readonly'&&!family?.enabled){
    $('edit-person')?.remove();
    $('download-changes')?.remove();
    $('download-stale')?.remove();
    $('save-mode').textContent='Wersja tylko do odczytu';
  }else editor=GenealogyEditor.mount({storage,isFamily:family?.enabled,canEdit:()=>!family?.enabled||!!familyUser,state:()=>G,selected:()=>state.selected,name:fullName,photo:photoSource,open:openPerson,message,onView:callback=>{onPersonView=callback;},apply:(next,id)=>{
    Object.assign(G,structuredClone(next));people.clear();G.data.people.forEach(p=>people.set(p.id,p));cardLayout.refresh();drawTree();focusPerson(id,state.scale);openPerson(id);
  }});
  family?.mount({canLeave:()=>!editor?.isDirty(),message,change:async user=>{
    const nextStorage=user?await GenealogyStorage.open(seed,{browserOnly:true,account:user.login}):{mode:'readonly',state:structuredClone(seed)};
    activeStorage=nextStorage;familyUser=user;
    Object.assign(G,structuredClone(nextStorage.state));people.clear();G.data.people.forEach(p=>people.set(p.id,p));
    cardLayout.refresh();drawTree();editor.refresh();
    if(personDialog.open&&state.selected)openPerson(state.selected);
  }});
  const search=$('person-search'),results=$('search-results');
  function closeSearch(){results.hidden=true;search.setAttribute('aria-expanded','false');}
  search.addEventListener('input',()=>{const query=normal(search.value.trim());if(!query){closeSearch();return;}const matches=[...people.values()].filter(p=>normal([fullName(p),p.maidenName,...p.formerLastNames,p.birthYear].filter(Boolean).join(' ')).includes(query));results.innerHTML=matches.length?matches.map(p=>`<button type="button" data-result="${p.id}">${esc(shortName(p))}<small>${esc(life(p))}${p.maidenName?' · z domu '+esc(p.maidenName):''}</small></button>`).join(''):'<p class="no-results">Nie znaleziono osoby.</p>';results.hidden=false;search.setAttribute('aria-expanded','true');results.querySelectorAll('button').forEach(button=>button.onclick=()=>{const id=button.dataset.result;closeSearch();search.value='';focusPerson(id,1);openPerson(id);});});
  search.addEventListener('keydown',e=>{if(e.key==='Escape')closeSearch();if(e.key==='ArrowDown'){e.preventDefault();results.querySelector('button')?.focus();}if(e.key==='Enter')results.querySelector('button')?.click();});
  document.addEventListener('click',e=>{if(!e.target.closest('.search-box'))closeSearch();});
  window.addEventListener('resize',()=>{if(state.x>viewport.clientWidth)focusPerson(G.data.rootPersonId);});
  requestAnimationFrame(goRoot);

  async function exportPDF(){
    const button=$('download-pdf'),message=$('export-message');button.disabled=true;message.hidden=false;message.textContent='Przygotowuję PDF całego drzewa…';
    try{
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const images=new Map();await Promise.all(Object.entries(G.thumbnails).map(([id,src])=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>{images.set(id,image);resolve();};image.onerror=()=>reject(new Error('Nie udało się odczytać portretu.'));image.src=src;})));
      const pad=70,top=160,bottom=100,W=G.width+pad*2,H=G.height+top+bottom;
      const resolution=Math.min(2.25,11500/Math.max(W,H));
      const canvas=document.createElement('canvas');canvas.width=Math.ceil(W*resolution);canvas.height=Math.ceil(H*resolution);const ctx=canvas.getContext('2d');ctx.scale(resolution,resolution);ctx.fillStyle='#f8faf5';ctx.fillRect(0,0,W,H);
      ctx.fillStyle='#24422e';ctx.font='42px Georgia';ctx.fillText('Moje drzewo genealogiczne',pad,64);ctx.font='20px Arial';ctx.fillText('Autor/Autorka: '+fullName(people.get(G.data.rootPersonId)),pad,99);ctx.font='16px Arial';ctx.fillStyle='#667867';ctx.fillText(`${people.size} osób · ${G.generations} pokoleń · Stan danych: ${G.updatedOn}`,pad,129);
      ctx.save();ctx.translate(pad,top);
      for(const edge of G.edges){ctx.strokeStyle=edge.kind==='marriage'?'#997ca3':edge.kind==='sibling'?'#9b8a62':'#9eaea0';ctx.lineWidth=1.6;ctx.setLineDash(edge.kind==='marriage'?[3,4]:edge.kind==='sibling'?[7,5]:[]);for(const points of edge.paths){ctx.beginPath();ctx.moveTo(...points[0]);for(let i=1;i+2<points.length;i+=3)ctx.bezierCurveTo(...points[i],...points[i+1],...points[i+2]);ctx.stroke();}ctx.setLineDash([]);for(const label of edge.labels){ctx.font='11px Arial';ctx.textAlign='center';ctx.strokeStyle='#f8faf5';ctx.lineWidth=4;ctx.strokeText(label.text,label.x,label.y);ctx.fillStyle='#82618e';ctx.fillText(label.text,label.x,label.y);}}
      function centered(value,x,y,maxWidth,size=14,bold=false){if(!value)return;ctx.font=`${bold?'bold ':''}${size}px Arial`;while(ctx.measureText(value).width>maxWidth&&size>8){size-=.4;ctx.font=`${bold?'bold ':''}${size}px Arial`;}ctx.textAlign='center';ctx.fillText(value,x,y);}
      for(const p of people.values()){
        const n=G.nodes[p.id],cx=n.x+n.w/2;ctx.setLineDash([]);ctx.fillStyle='#fffefc';ctx.strokeStyle=p.id===G.data.rootPersonId?'#244f3c':'#ced8cb';ctx.lineWidth=p.id===G.data.rootPersonId?2:1;ctx.beginPath();ctx.roundRect(n.x,n.y,n.w,n.h,9);ctx.fill();ctx.stroke();ctx.fillStyle=G.branches[p.id]==='father'?'#537d98':'#5d8463';ctx.fillRect(n.x+8,n.y,n.w-16,3);
        const image=images.get(p.id),px=cx-35,py=n.y+12,pw=70,ph=92;ctx.fillStyle='#f0f1eb';ctx.fillRect(px,py,pw,ph);
        if(image){const s=Math.min(pw/image.width,ph/image.height);ctx.drawImage(image,px+(pw-image.width*s)/2,py+(ph-image.height*s)/2,image.width*s,image.height*s);}else{ctx.fillStyle='#98a995';centered([p.firstName?.[0],p.lastName?.[0]].filter(Boolean).join('')||'?',cx,py+70,120,32);}
        ctx.fillStyle='#243c2e';centered(p.id==='person_0038'&&!p.firstName?'Matka Anny':p.firstName||'Imię nieznane',cx,n.y+121,130,14,true);centered(p.lastName||(p.id==='person_0038'&&!p.firstName?'imię nieznane':p.title||''),cx,n.y+139,130,14,Boolean(p.lastName));ctx.fillStyle='#65745f';extraLines(p).filter(t=>t!==p.title).slice(0,2).forEach((t,i)=>centered(t,cx,n.y+155+i*13,130,10.5));ctx.fillStyle='#243c2e';ctx.font='bold 12px Arial';if(ctx.measureText(life(p)).width<=130){centered(life(p),cx,n.y+189,130,12,true);}else{centered('ur. '+GenealogyDates.part(p,'birth'),cx,n.y+181,130,10.5,true);centered('zm. '+GenealogyDates.part(p,'death'),cx,n.y+194,130,10.5,true);}
        const birthplace=p.id==='person_0052'?'Ur.: nieznane; zm.: Polska':'Ur.: '+place(p.birthPlace);ctx.font='10.8px Arial';const placeLines=[];let line='';for(const word of birthplace.split(' ')){if(line&&ctx.measureText(line+' '+word).width>130){placeLines.push(line);line=word;}else line=line?line+' '+word:word;}if(line)placeLines.push(line);ctx.fillStyle='#65745f';placeLines.slice(0,2).forEach((t,i)=>centered(t,cx,n.y+207+i*13,130,10.8));
      }
      ctx.restore();ctx.textAlign='left';ctx.font='15px Arial';ctx.fillStyle='#65745f';ctx.fillText('Źródła: rozmowy rodzinne, dokumenty i podpisy fotografii. Szczegóły w kartach osób.',pad,H-62);ctx.font='12px Arial';ctx.fillText(G.credits?.length?G.credits.map(c=>[c.author,c.sourcePage,c.license].filter(Boolean).join(' · ')).join('; '):'Zdjęcia: materiały użytkownika.',pad,H-39);ctx.fillText('? — brak danych. Wielokropek — osoba żyje według przekazanych informacji. Brak daty śmierci nie potwierdza statusu życia.',pad,H-20);
      const pdf=await PDFLib.PDFDocument.create();pdf.setTitle('Moje drzewo genealogiczne — '+fullName(people.get(G.data.rootPersonId)));pdf.setAuthor(fullName(people.get(G.data.rootPersonId)));pdf.setSubject(`Wersja robocza, ${people.size} osób, ${G.generations} pokoleń`);
      const pw=3370.394,ph=2383.937,page=pdf.addPage([pw,ph]),image=await pdf.embedPng(canvas.toDataURL('image/png'));const s=Math.min((pw-48)/W,(ph-48)/H);page.drawImage(image,{x:(pw-W*s)/2,y:(ph-H*s)/2,width:W*s,height:H*s});
      const bytes=await pdf.save(),url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'})),a=document.createElement('a');a.href=url;a.download='moje-drzewo-genealogiczne.pdf';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);canvas.width=1;canvas.height=1;message.textContent='PDF jest gotowy.';setTimeout(()=>{message.hidden=true;},3500);
    }catch(error){console.error(error);message.textContent='Nie udało się utworzyć PDF. Spróbuj ponownie.';}finally{button.disabled=false;}
  }
  $('download-pdf').onclick=exportPDF;
})().catch(error=>{console.error(error);const box=document.getElementById('save-mode');if(box)box.textContent='Nie udało się wczytać strony. Odśwież stronę.';});

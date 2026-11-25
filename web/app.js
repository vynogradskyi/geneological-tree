(async () => {
  'use strict';
  const I=window.GenealogyI18n;await I.ready;
  const t=(key,values)=>I.t(key,values);
  const responsive=window.GenealogyResponsive;responsive.init();
  const seed = await (window.GENEALOGY_READY || Promise.resolve(window.GENEALOGY));
  const family=window.GenealogyFamily;
  let familyUser=family?.enabled?await family.ready():null;
  let activeStorage=family?.enabled&&!familyUser?{mode:'readonly',state:structuredClone(seed)}:await GenealogyStorage.open(seed,{browserOnly:family?.enabled,account:familyUser?.login});
  const storage=new Proxy({}, {get:(_,key)=>typeof activeStorage[key]==='function'?activeStorage[key].bind(activeStorage):activeStorage[key]});
  const G = structuredClone(storage.state);
  Object.assign(G,GenealogyFamilyLayout.create(G.data));GenealogyCardView.normalize(G);
  window.GENEALOGY = G;
  const metrics=window.GenealogyCardMetrics;
  document.documentElement.style.setProperty('--card-width',metrics.width+'px');
  document.documentElement.style.setProperty('--card-height',metrics.height+'px');
  document.documentElement.style.setProperty('--card-photo',metrics.photo+'px');
  const people = new Map(G.data.people.map(p => [p.id, p]));
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normal = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ł/g,'l').replace(/Ł/g,'L').toLowerCase();
  const display=p=>I.person(p,G);
  const fullName = raw => {const p=display(raw);return [p.firstName || t('Imię nieznane'),p.lastName].filter(Boolean).join(' ');};
  const shortName = p => {if(p.firstName||p.lastName)return fullName(p);const child=[...people.values()].find(c=>(c.Mommy===p.id||c.Daddy===p.id)&&(c.firstName||c.lastName));return child?t(child.Mommy===p.id?'Matka osoby {value} · imię nieznane':'Ojciec osoby {value} · imię nieznane',{value:fullName(child)}):fullName(p);};
  const date = value => GenealogyDates.date(value);
  const life = p => GenealogyDates.life(p);
  const photoSource = p => GenealogyStorage.photoSource(G,p);
  const place = value => value ? [value.city, value.region, value.country].filter(Boolean).join(', ') || 'nieznane' : 'nieznane';
  const extraLines = raw => {const p=display(raw);return [p.maidenName ? `z domu ${p.maidenName}` : '', p.formerLastNames.length ? `poprz. ${p.formerLastNames.join(', ')}` : '', p.title || '', p.occupation || '', p.deathCircumstances || ''].filter(Boolean).map(I.translate);};
  const pathData = points => `M ${points[0].join(' ')} C ${points.slice(1).map(p => p.join(' ')).join(' ')}`;
  const viewport = $('viewport'), world = $('world'), personDialog = $('person-dialog'), photoDialog = $('photo-dialog');
  const state = {scale:1,x:0,y:0,selected:null};let sheetReturn=null;
  const generations=GenealogyGenerations.create({element:$('generation-scale'),model:G,t});
  const viewArea=()=>{const left=$('generation-scale').offsetWidth;return {left,width:Math.max(1,viewport.clientWidth-left),centerX:(viewport.clientWidth+left)/2};};
  function updateGenerations(){generations.update(state);}
  personDialog.addEventListener('close',()=>{if(sheetReturn){Object.assign(state,sheetReturn);sheetReturn=null;transform();}personButtons.get(state.selected)?.focus({preventScroll:true});});
  const svg = $('connections'), personButtons = new Map();
  let colors=GenealogyColors.create(G.data,G.edges);
  function paintConnections(){
    svg.replaceChildren();
    const defs=document.createElementNS('http://www.w3.org/2000/svg','defs');svg.append(defs);
    let gradientNumber=0;
  for (const edge of G.edges) {
    for (const points of edge.paths) {
      const path = document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d',pathData(points)); path.setAttribute('class',`connection ${edge.kind}`);
      if(edge.kind==='parent'){
        const {from,to}=colors.edge(edge),id='family-color-'+gradientNumber++;
        if(from===to){path.style.stroke=from;svg.append(path);continue;}
        const gradient=document.createElementNS('http://www.w3.org/2000/svg','linearGradient');
        gradient.id=id;gradient.setAttribute('gradientUnits','userSpaceOnUse');
        for(const[key,value]of Object.entries({x1:points[0][0],y1:points[0][1],x2:points.at(-1)[0],y2:points.at(-1)[1]}))gradient.setAttribute(key,value);
        for(const[offset,color]of GenealogyColors.stops(from,to)){const stop=document.createElementNS('http://www.w3.org/2000/svg','stop');stop.setAttribute('offset',offset);stop.setAttribute('stop-color',color);gradient.append(stop);}
        defs.append(gradient);path.style.stroke=`url(#${id})`;
      }
      svg.append(path);
    }
    for (const label of edge.labels) {
      const text = document.createElementNS('http://www.w3.org/2000/svg','text');
      text.setAttribute('x',label.x);text.setAttribute('y',label.y);text.setAttribute('text-anchor','middle');text.setAttribute('class','edge-label');text.textContent=t(label.text);svg.append(text);
    }
  }
  }
  function updateLayoutView(){
    world.style.width=G.width+'px';world.style.height=G.height+'px';svg.setAttribute('width',G.width);svg.setAttribute('height',G.height);
    for(const[id,node]of Object.entries(G.nodes)){const button=personButtons.get(id);if(button)button.style.left=node.x+'px';}
    paintConnections();
    updateGenerations();
  }
  function drawTree(){
    colors=GenealogyColors.create(G.data,G.edges);
    svg.replaceChildren();$('people').replaceChildren();personButtons.clear();
  world.style.width = G.width+'px'; world.style.height = G.height+'px';
  svg.setAttribute('width',G.width); svg.setAttribute('height',G.height);
  paintConnections();
  for (const raw of people.values()) {
    const p=display(raw);
    const pos=G.nodes[p.id],button=document.createElement('button');
    button.type='button';button.className=`person-node branch-${G.branches[p.id]}`;button.dataset.person=p.id;
    Object.assign(button.style,{left:pos.x+'px',top:pos.y+'px',width:pos.w+'px',height:pos.h+'px'});button.classList.toggle('selected',state.selected===p.id);
    const theme=colors.people[p.id];button.style.setProperty('--branch-color',theme.color);button.style.setProperty('--branch-tint',theme.tint);button.style.setProperty('--branch-band',`linear-gradient(90deg,${theme.bands[0]} 0 50%,${theme.bands[1]} 50% 100%)`);
    button.setAttribute('aria-label',`${shortName(p)}, ${life(p)}. Otwórz szczegóły`);
    const initials=[p.firstName?.[0],p.lastName?.[0]].filter(Boolean).join('') || '?';
    const image=G.thumbnails[p.id] ? `<img class="node-photo" src="${G.thumbnails[p.id]}" alt="" draggable="false">` : `<span class="node-photo node-placeholder"><b>${esc(initials)}</b><span>brak zdjęcia</span></span>`;
    const subtitles=extraLines(p);
    button.innerHTML=image+`<span class="node-names"><span class="node-name">${esc(p.firstName || t('Imię nieznane'))}</span>`+`<span class="node-name">${esc(p.lastName || p.title || '')}</span></span>`+(subtitles.length?`<span class="node-subtitle">${esc(subtitles.filter(s=>s!==p.title).slice(0,2).join(' · '))}</span>`:'')+`<span class="node-dates">${esc(life(p))}</span>`;
    button.addEventListener('click',()=>{if(!dragWasMoved)openPerson(p.id);});
    $('people').append(button);GenealogyCardView.fit(button);personButtons.set(p.id,button);
  }
  const author=fullName(people.get(G.data.rootPersonId));$('author-name').textContent=author;$('go-root').textContent=people.get(G.data.rootPersonId).firstName||t('Osoba główna');document.title=t('Moje drzewo genealogiczne')+' · '+author;
  $('summary').textContent=I.summary(people.size,G.generations);
  $('updated-on').textContent=G.updatedOn;$('mobile-root-name').textContent=fullName(people.get(G.data.rootPersonId));
  I.dom();generations.refresh();updateGenerations();
  }
  drawTree();
  let activeCard=null;
  const cardLayout=GenealogyCardLayout.create({model:G,onChange:updateLayoutView,onMessage:message,onActiveChange:id=>{if(activeCard)personButtons.get(activeCard)?.classList.remove('is-dragging');activeCard=id;if(id)personButtons.get(id)?.classList.add('is-dragging');viewport.classList.toggle('card-drag-active',!!id);}});
  function transform(){world.style.transform=`translate(${state.x}px,${state.y}px) scale(${state.scale})`;$('zoom-label').textContent=Math.round(state.scale*100)+'%';updateGenerations();}
  function focusPerson(id, scale=1){const n=G.nodes[id];state.scale=scale;state.x=viewArea().centerX-(n.x+n.w/2)*scale;state.y=Math.min(viewport.clientHeight*.72,viewport.clientHeight-n.h*scale/2-(responsive.mobile?88:24))-(n.y+n.h/2)*scale;transform();}
  function zoom(factor,x=viewArea().centerX,y=viewport.clientHeight/2){const old=state.scale;state.scale=Math.max(.01,Math.min(2.5,old*factor));state.x=x-(x-state.x)*state.scale/old;state.y=y-(y-state.y)*state.scale/old;transform();}
  $('zoom-in').onclick=()=>zoom(1.25);$('zoom-out').onclick=()=>zoom(.8);
  function goRoot(){
    if(!responsive.mobile){focusPerson(G.data.rootPersonId,1);return;}
    if(viewport.clientHeight<500){focusPerson(G.data.rootPersonId,.75);return;}
    const p=people.get(G.data.rootPersonId),nodes=[p.id,p.Mommy,p.Daddy].filter(Boolean).map(id=>G.nodes[id]);
    const left=Math.min(...nodes.map(n=>n.x)),right=Math.max(...nodes.map(n=>n.x+n.w)),top=Math.min(...nodes.map(n=>n.y)),bottom=Math.max(...nodes.map(n=>n.y+n.h));
    const area=viewArea(),familyScale=Math.min(.9,(area.width-24)/(right-left),(viewport.clientHeight-96)/(bottom-top));
    // Expanded ancestor branches can put the parents several screens apart.
    // Keep the root readable; relatives remain accessible through the person sheet.
    if(familyScale<.5){focusPerson(p.id,.75);return;}
    state.scale=familyScale;
    state.x=area.left+(area.width-(right-left)*state.scale)/2-left*state.scale;state.y=(viewport.clientHeight-76-(bottom-top)*state.scale)/2-top*state.scale;transform();
  }
  $('go-root').onclick=goRoot;
  $('fit-tree').onclick=()=>{const area=viewArea(),height=viewport.clientHeight-(responsive.mobile?90:0);state.scale=Math.max(.01,Math.min((area.width-50)/G.width,(height-70)/G.height));state.x=area.left+(area.width-G.width*state.scale)/2;state.y=(height-G.height*state.scale)/2+12;transform();};
  let drag=null,dragWasMoved=false;
  const pointers=new Map();let pinch=null;
  viewport.addEventListener('pointerdown',e=>{
    if(e.button!==0||e.target.closest('#mobile-quick-actions,#mobile-layout-exit'))return;
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    const card=e.target.closest('.person-node'),canMove=card&&cardLayout.isEnabled()&&(e.pointerType==='mouse'||responsive.mobile);
    drag={id:e.pointerId,startX:e.clientX,startY:e.clientY,x:state.x,y:state.y,mode:canMove?'card':'pan',person:canMove?card.dataset.person:null,cardX:canMove?G.nodes[card.dataset.person].x:null};
    dragWasMoved=false;
    if(pointers.size===2){if(cardLayout.isDragging())cardLayout.cancel();const[a,b]=[...pointers.values()];const rect=viewport.getBoundingClientRect();pinch={distance:Math.hypot(a.x-b.x,a.y-b.y),scale:state.scale,worldX:((a.x+b.x)/2-rect.left-state.x)/state.scale,worldY:((a.y+b.y)/2-rect.top-state.y)/state.scale};drag.mode='pan';}
    if(!card)viewport.setPointerCapture(e.pointerId);
  });
  viewport.addEventListener('pointermove',e=>{
    if(!pointers.has(e.pointerId))return;
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pinch&&pointers.size===2){const[a,b]=[...pointers.values()];const distance=Math.hypot(a.x-b.x,a.y-b.y),rect=viewport.getBoundingClientRect();state.scale=Math.max(.01,Math.min(2.5,pinch.scale*distance/pinch.distance));state.x=(a.x+b.x)/2-rect.left-pinch.worldX*state.scale;state.y=(a.y+b.y)/2-rect.top-pinch.worldY*state.scale;transform();dragWasMoved=true;return;}
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
    pointers.delete(e.pointerId);pinch=null;drag=null;viewport.classList.remove('dragging');if(pointers.size===1){const[id,point]=[...pointers][0];drag={id,startX:point.x,startY:point.y,x:state.x,y:state.y,mode:'pan'};}
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
    const p=display(people.get(id));state.selected=id;
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
    $('person-details').innerHTML=`<section class="details-hero">${portrait}<h2 id="person-name">${esc(shortName(p))}</h2><p class="hero-life">${esc(life(p))}</p>${p.maidenName?`<p class="detail-subtitle">z domu ${esc(p.maidenName)}</p>`:''}${[p.title,p.occupation].filter(Boolean).map(t=>`<span class="role-label">${esc(t)}</span>`).join('')}${I.hasStale(people.get(id),G)?`<p class="translation-notice">${esc(t('Brak aktualnego tłumaczenia — pokazano tekst polski.'))}</p>`:''}${G.disconnectedPeople?.includes(p.id)?'<p class="issue">Brak ustalonego połączenia z osobą główną. Sprawdź powiązania rodzinne.</p>':''}</section>`+
      `<section class="details-section life-section"><h3>Życie</h3><dl class="facts">${facts.map(([label,value])=>`<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`).join('')}</dl></section>`+
      `<section class="details-section family-section"><h3>Rodzina</h3>${relativeRow('Matka',p.Mommy?[p.Mommy]:[])}${relativeRow('Ojciec',p.Daddy?[p.Daddy]:[])}${relativeRow('Małżeństwa',spouseIds)}${relativeRow('Dzieci',children)}${relativeRow('Rodzeństwo',[...siblings])}${marriages.filter(r=>r.status==='rozwiedzeni').map(r=>`<p class="photo-credit">Rozwód: ${esc(fullName(people.get(r.personIds.find(pid=>pid!==id))))}.</p>`).join('')}</section>`+
      (p.notes?`<section class="details-section"><h3>Historia i uwagi</h3><p class="notes">${esc(p.notes)}</p></section>`:'')+
      (issues.length?`<section class="details-section"><h3>Do wyjaśnienia</h3>${issues.map(q=>`<p class="issue">${esc(I.issue(q,G))}</p>`).join('')}</section>`:'')+
      `<section class="details-section"><h3>Źródła informacji</h3><ol class="sources">${p.sources.map(s=>`<li>${linkify(s)}</li>`).join('')}</ol>${G.credits.filter(c=>c.personId===id).map(c=>`<p class="photo-credit">Wcześniej wskazane źródło zdjęcia: <a href="${esc(c.sourcePage)}" target="_blank" rel="noopener noreferrer">${esc(c.author)}</a> · <a href="${esc(c.licenseUrl)}" target="_blank" rel="noopener noreferrer">${esc(c.license)}</a>. Obecny plik dostarczony przez użytkownika.</p>`).join('')}</section>`;
    $('person-details').querySelectorAll('[data-relative]').forEach(button=>button.onclick=()=>{const next=button.dataset.relative;focusPerson(next,state.scale<.65?.9:state.scale);if(responsive.mobile)sheetReturn={x:state.x,y:state.y,scale:state.scale};openPerson(next);});
    if(p.photo)$('enlarge-portrait').onclick=()=>{$('full-photo').src=photoSource(p);$('full-photo').alt=fullName(p);photoDialog.showModal();};
    if(!personDialog.open){if(responsive.mobile)sheetReturn={x:state.x,y:state.y,scale:state.scale};personDialog.classList.remove('sheet-expanded');$('toggle-person-size').setAttribute('aria-expanded','false');personDialog.showModal();}if(responsive.mobile&&!personDialog.classList.contains('sheet-expanded')){const node=G.nodes[id],free=Math.max(120,viewport.clientHeight-personDialog.offsetHeight);state.x=viewport.clientWidth/2-(node.x+node.w/2)*state.scale;state.y=free/2-(node.y+node.h/2)*state.scale;transform();}personDialog.scrollTop=0;
    $('announcer').textContent=t('Otwarta karta: {value}',{value:fullName(p)});I.dom(personDialog);
  }
  $('close-person').onclick=()=>personDialog.close();$('close-photo').onclick=()=>photoDialog.close();
  for(const dialog of [personDialog,photoDialog])dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
  let toastTimer;
  function message(text){text=I.translate(text);clearTimeout(toastTimer);const box=$('export-message');box.textContent=text;box.hidden=false;const status=$('person-status');if(personDialog.open){status.textContent=text;status.hidden=false;}toastTimer=setTimeout(()=>{box.hidden=true;status.hidden=true;},7000);}
  let editor;
  if(storage.mode==='readonly'&&!family?.enabled){
    $('edit-person')?.remove();
    $('download-changes')?.remove();
    $('download-stale')?.remove();
    $('save-mode').textContent='Wersja tylko do odczytu';
  }else editor=GenealogyEditor.mount({storage,isFamily:family?.enabled,canEdit:()=>!family?.enabled||!!familyUser,display,language:()=>I.language,state:()=>G,selected:()=>state.selected,name:fullName,photo:photoSource,open:openPerson,message,onView:callback=>{onPersonView=callback;},apply:(next,id)=>{
    Object.assign(G,structuredClone(next));Object.assign(G,GenealogyFamilyLayout.create(G.data));GenealogyCardView.normalize(G);people.clear();G.data.people.forEach(p=>people.set(p.id,p));cardLayout.refresh();drawTree();focusPerson(id,state.scale);openPerson(id);
  }});
  family?.mount({canLeave:()=>!editor?.isDirty(),message,change:async user=>{
    const nextStorage=user?await GenealogyStorage.open(seed,{browserOnly:true,account:user.login}):{mode:'readonly',state:structuredClone(seed)};
    activeStorage=nextStorage;familyUser=user;
    for(const key of Object.keys(G))delete G[key];Object.assign(G,structuredClone(nextStorage.state));Object.assign(G,GenealogyFamilyLayout.create(G.data));GenealogyCardView.normalize(G);people.clear();G.data.people.forEach(p=>people.set(p.id,p));
    cardLayout.refresh();drawTree();editor.refresh();
    if(personDialog.open&&state.selected)openPerson(state.selected);I.dom();
  }});
  const languageSelect=$('language-select');languageSelect.value=I.language;
  languageSelect.onchange=()=>{
    if(editor?.isDirty()){languageSelect.value=I.language;message(t('Najpierw zapisz lub anuluj edycję, aby zmienić język.'));return;}
    I.setLanguage(languageSelect.value);drawTree();editor?.refresh();family?.refresh();
    if(personDialog.open&&state.selected)openPerson(state.selected);
    closeSearch();I.dom();
  };
  const search=$('person-search'),results=$('search-results');
  function closeSearch(){responsive.closeSearch();results.hidden=true;search.setAttribute('aria-expanded','false');}
  search.addEventListener('input',()=>{const query=normal(search.value.trim());if(!query){closeSearch();return;}const matches=[...people.values()].filter(p=>normal([fullName(p),p.firstName,p.lastName,p.maidenName,...p.formerLastNames,...display(p).formerLastNames,...Object.values(display(p).birthPlace||{}),p.birthYear].filter(Boolean).join(' ')).includes(query));results.innerHTML=matches.length?matches.map(p=>`<button type="button" data-result="${p.id}">${esc(shortName(p))}<small>${esc(life(p))}${p.maidenName?' · z domu '+esc(p.maidenName):''}</small></button>`).join(''):'<p class="no-results">Nie znaleziono osoby.</p>';results.hidden=false;search.setAttribute('aria-expanded','true');I.dom(results);results.querySelectorAll('button').forEach(button=>button.onclick=()=>{const id=button.dataset.result;closeSearch();search.value='';focusPerson(id,1);openPerson(id);});});
  search.addEventListener('keydown',e=>{if(e.key==='Escape')closeSearch();if(e.key==='ArrowDown'){e.preventDefault();results.querySelector('button')?.focus();}if(e.key==='Enter')results.querySelector('button')?.click();});
  document.addEventListener('click',e=>{if(!responsive.mobile&&!e.target.closest('.search-box'))closeSearch();});
  responsive.onChange(()=>{cardLayout.setMobile(responsive.mobile);});
  let previousViewport={centerX:viewArea().centerX,height:viewport.clientHeight};
  function resizeView(){const next={centerX:viewArea().centerX,height:viewport.clientHeight};const dx=next.centerX-previousViewport.centerX,dy=(next.height-previousViewport.height)*.72;state.x+=dx;state.y+=dy;if(sheetReturn){sheetReturn.x+=dx;sheetReturn.y+=dy;}previousViewport=next;transform();}
  window.addEventListener('resize',resizeView);
  if(window.ResizeObserver)new ResizeObserver(resizeView).observe(viewport);
  requestAnimationFrame(goRoot);

  async function exportPDF(){
    const button=$('download-pdf'),message=$('export-message');button.disabled=true;message.hidden=false;message.textContent=t('Przygotowuję PDF całego drzewa…');
    try{
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const images=new Map();await Promise.all(Object.entries(G.thumbnails).map(([id,src])=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>{images.set(id,image);resolve();};image.onerror=()=>reject(new Error('Nie udało się odczytać portretu.'));image.src=src;})));
      const pad=70,top=160,bottom=100,W=G.width+pad*2,H=G.height+top+bottom;
      const resolution=Math.min(2.25,11500/Math.max(W,H));
      const canvas=document.createElement('canvas');canvas.width=Math.ceil(W*resolution);canvas.height=Math.ceil(H*resolution);const ctx=canvas.getContext('2d');ctx.scale(resolution,resolution);ctx.fillStyle=GenealogyColors.palette.background;ctx.fillRect(0,0,W,H);
      ctx.fillStyle='#24422e';ctx.font='42px Georgia';ctx.fillText(t('Moje drzewo genealogiczne'),pad,64);ctx.font='20px Arial';ctx.fillText(t('Autor/Autorka:')+' '+fullName(people.get(G.data.rootPersonId)),pad,99);ctx.font='16px Arial';ctx.fillStyle='#667867';ctx.fillText(I.summary(people.size,G.generations)+' · '+G.updatedOn,pad,129);
      ctx.save();ctx.translate(pad,top);
      for(const edge of G.edges){ctx.strokeStyle=edge.kind==='marriage'?'#997ca3':edge.kind==='sibling'?'#9b8a62':'#9eaea0';ctx.lineWidth=1.6;ctx.setLineDash(edge.kind==='marriage'?[3,4]:edge.kind==='sibling'?[7,5]:[]);for(const points of edge.paths){ctx.strokeStyle=GenealogyColors.canvasStroke(ctx,edge,points,colors);ctx.lineWidth=edge.kind==='parent'?2:1.6;ctx.beginPath();ctx.moveTo(...points[0]);for(let i=1;i+2<points.length;i+=3)ctx.bezierCurveTo(...points[i],...points[i+1],...points[i+2]);ctx.stroke();}ctx.setLineDash([]);for(const label of edge.labels){ctx.font='11px Arial';ctx.textAlign='center';ctx.strokeStyle='#f8faf5';ctx.lineWidth=4;ctx.strokeText(t(label.text),label.x,label.y);ctx.fillStyle='#82618e';ctx.fillText(t(label.text),label.x,label.y);}}
      for(const raw of people.values()){
        const p=display(raw);
        GenealogyCardView.drawPDF(ctx,{node:G.nodes[p.id],branch:G.branches[p.id],theme:colors.people[p.id],root:p.id===G.data.rootPersonId,image:images.get(p.id),
          names:[p.firstName||t('Imię nieznane'),p.lastName||p.title||''],
          subtitle:extraLines(p).filter(text=>text!==p.title).slice(0,2).join(' · '),dates:life(p),initials:[p.firstName?.[0],p.lastName?.[0]].filter(Boolean).join('')||'?',noPhoto:t('brak zdjęcia')});
      }
      ctx.restore();ctx.textAlign='left';ctx.font='15px Arial';ctx.fillStyle='#65745f';ctx.fillText(t('Źródła: rozmowy rodzinne, dokumenty i podpisy fotografii. Szczegóły w kartach osób.'),pad,H-62);ctx.font='12px Arial';ctx.fillText(G.credits?.length?G.credits.map(c=>[c.author,c.sourcePage,c.license].filter(Boolean).join(' · ')).join('; '):t('Zdjęcia: materiały użytkownika.'),pad,H-39);ctx.fillText(t('? — brak danych. Wielokropek — osoba żyje według przekazanych informacji. Brak daty śmierci nie potwierdza statusu życia.'),pad,H-20);
      const pdf=await PDFLib.PDFDocument.create();pdf.setTitle(t('Moje drzewo genealogiczne')+' — '+fullName(people.get(G.data.rootPersonId)));pdf.setAuthor(fullName(people.get(G.data.rootPersonId)));pdf.setSubject(`Wersja robocza, ${people.size} osób, ${G.generations} pokoleń`);
      const pw=3370.394,ph=2383.937,page=pdf.addPage([pw,ph]),image=await pdf.embedPng(canvas.toDataURL('image/png'));const s=Math.min((pw-48)/W,(ph-48)/H);page.drawImage(image,{x:(pw-W*s)/2,y:(ph-H*s)/2,width:W*s,height:H*s});
      const bytes=await pdf.save(),url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'})),a=document.createElement('a');a.href=url;a.download='moje-drzewo-genealogiczne.pdf';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);canvas.width=1;canvas.height=1;message.textContent=t('PDF jest gotowy.');setTimeout(()=>{message.hidden=true;},3500);
    }catch(error){console.error(error);message.textContent=t('Nie udało się utworzyć PDF. Spróbuj ponownie.');}finally{button.disabled=false;}
  }
  $('download-pdf').onclick=()=>{responsive.closeMenu();exportPDF();};
})().catch(error=>{console.error(error);const text=window.GenealogyI18n?.t('Nie udało się wczytać strony. Odśwież stronę.')||'Nie udało się wczytać strony. Odśwież stronę.';const box=document.getElementById('save-mode');if(box)box.textContent=text;const notice=document.getElementById('export-message');if(notice){notice.textContent=text;notice.setAttribute('role','alert');notice.hidden=false;}});

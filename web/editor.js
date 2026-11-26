window.GenealogyEditor = (() => {
  const I=window.GenealogyI18n;
  const t=(key,values)=>I.t(key,values);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const lines=value=>String(value).split('\n').map(v=>v.trim()).filter(Boolean);
  const nullable=value=>value.trim()||null;
  const textFields=[['firstName','Imię'],['lastName','Nazwisko'],['maidenName','Nazwisko panieńskie'],['patronymic','Imię odojcowskie'],['title','Tytuł'],['occupation','Zawód / działalność']];
  function input(name,label,value,extra=''){return `<label class="edit-field"><span>${label}</span><input name="${name}" value="${esc(value)}" ${extra}></label>`;}
  function area(name,label,value,rows=3){return `<label class="edit-field wide"><span>${label}</span><textarea name="${name}" rows="${rows}">${esc(value)}</textarea></label>`;}
  function validate(p,data,marriages){
    const people=new Map(data.people.map(other=>[other.id,other.id===p.id?p:other]));
    if(p.Mommy&&p.Mommy===p.Daddy)throw Error('Matka i ojciec muszą być różnymi osobami.');
    for(const field of ['Mommy','Daddy'])if(p[field]&&(p[field]===p.id||!people.has(p[field])))throw Error('Nieprawidłowe powiązanie z rodzicem.');
    function visit(id,path){if(path.has(id))throw Error('Ta zmiana tworzy cykl: osoba nie może być własnym przodkiem.');const next=new Set(path).add(id);for(const field of ['Mommy','Daddy'])if(people.get(id)[field])visit(people.get(id)[field],next);}
    for(const id of people.keys())visit(id,new Set());
    for(const prefix of ['birth','death']){const value=p[prefix+'Date'],year=p[prefix+'Year'];if(value){if(!/^\d{4}(-\d{2}){0,2}$/.test(value))throw Error('Datę wpisz jako RRRR, RRRR-MM lub RRRR-MM-DD.');const parts=value.split('-').map(Number),[y,m=1,d=1]=parts;const date=new Date(0);date.setUTCHours(0,0,0,0);date.setUTCFullYear(y,m-1,d);if(y<1||date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d)throw Error('Nieprawidłowa data w kalendarzu.');if(y!==year)throw Error('Rok i data muszą być zgodne.');}else if(year!==null)throw Error('Uzupełnij datę lub usuń rok.');}
    if(p.isLiving===true&&(p.deathDate||p.deathDateNote))throw Error('Osoba żyjąca nie może mieć daty ani opisu śmierci. Usuń je lub zmień status życia.');
    if(p.birthDate&&p.deathDate&&p.birthDate>p.deathDate)throw Error('Data śmierci nie może poprzedzać daty urodzenia.');
    if(p.siblings.includes(p.id))throw Error('Osoba nie może być własnym rodzeństwem.');
    const all=data.relationships.filter(r=>!r.personIds.includes(p.id)).concat(marriages),ids=new Set(all.map(r=>r.id));
    if(ids.size!==all.length)throw Error('Identyfikator małżeństwa jest już zajęty.');
    for(const r of all){if(new Set(r.personIds).size!==2||r.personIds.some(id=>!people.has(id)))throw Error('Wybierz inną osobę w małżeństwie.');if(r.startYear&&r.endYear&&r.startYear>r.endYear)throw Error('Koniec małżeństwa nie może poprzedzać początku.');if(r.previousRelationshipId&&(!ids.has(r.previousRelationshipId)||r.previousRelationshipId===r.id))throw Error('Nieprawidłowe poprzednie małżeństwo.');}
    if(/[\u0400-\u04ff]/.test(JSON.stringify([p,marriages])))throw Error('Dane wpisuj po polsku lub zatwierdzoną pisownią łacińską.');
  }
  function mount(api){
    let editing=false,dirty=false,wasExpanded=false;
    const editButton=document.getElementById('edit-person'),content=document.getElementById('person-details'),dialog=document.getElementById('person-dialog');
    const storage=api.storage,mode=document.getElementById('save-mode'),exportButton=document.getElementById('download-changes');
    const canEdit=()=>!api.canEdit||api.canEdit();
    function refresh(){
      mode.textContent=!canEdit()?'Wersja tylko do odczytu':api.isFamily?'Prototyp rodzinny · zmiany i zdjęcia tylko w tej przeglądarce. Pobierz ZIP, aby je przenieść.':storage.mode==='project'?'Edytor projektu · zmiany i zdjęcia zapisują się w folderze projektu':'Tryb HTML · zmiany zapisują się w tej przeglądarce. Pobierz zmiany, aby przenieść je do folderu projektu.';
      if(api.state().isExample)mode.textContent='Przykład demonstracyjny · '+mode.textContent;
      editButton.hidden=!canEdit()||editing;
      exportButton.hidden=!canEdit()||storage.mode==='project';
      document.getElementById('download-stale').hidden=!canEdit()||!storage.staleBackup;I.dom();
    }
    exportButton.onclick=async()=>{if(!canEdit())return;window.GenealogyResponsive?.closeMenu();exportButton.disabled=true;try{await storage.exportChanges();}catch(error){api.message(error.message);}finally{exportButton.disabled=false;}};
    document.getElementById('download-stale').onclick=async()=>{if(!canEdit())return;window.GenealogyResponsive?.closeMenu();try{await storage.exportChanges(true);}catch(error){api.message(error.message);}};
    function stop(){if(editing){dialog.classList.toggle('sheet-expanded',wasExpanded);const expand=document.getElementById('toggle-person-size');expand.disabled=false;expand.setAttribute('aria-expanded',String(wasExpanded));expand.textContent=t(wasExpanded?'Zwiń':'Rozwiń');}editing=false;dirty=false;refresh();}
    refresh();
    api.onView(stop);
    dialog.addEventListener('cancel',e=>{if(editing&&dirty){e.preventDefault();api.message('Masz niezapisane zmiany. Użyj „Zapisz” albo „Anuluj”.');}});
    dialog.addEventListener('click',e=>{if(!editing||!dirty||e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom){e.stopImmediatePropagation();api.message('Masz niezapisane zmiany. Użyj „Zapisz” albo „Anuluj”.');}},{capture:true});
    for(const closeId of ['close-person','show-in-tree'])document.getElementById(closeId).addEventListener('click',e=>{if(editing&&dirty){e.stopImmediatePropagation();api.message('Masz niezapisane zmiany. Użyj „Zapisz” albo „Anuluj”.');}},{capture:true});
    editButton.onclick=()=>{
      if(!canEdit())return;
      const data=api.state().data,basePerson=structuredClone(data.people.find(p=>p.id===api.selected())),p=structuredClone(api.display?api.display(basePerson):basePerson),language=I.language,baseMarriages=structuredClone(data.relationships.filter(r=>r.personIds.includes(p.id)));
      const baseTranslation=structuredClone(api.state().translations?.[language]?.people?.[p.id]||null);
      let upload=null,removePhoto=false,uploadBusy=false;
      wasExpanded=dialog.classList.contains('sheet-expanded');dialog.classList.add('sheet-expanded');document.getElementById('toggle-person-size').disabled=true;document.getElementById('toggle-person-size').setAttribute('aria-expanded','true');document.getElementById('toggle-person-size').textContent=t('Zwiń');editing=true;dirty=false;editButton.hidden=true;
      const sorted=data.people.filter(other=>other.id!==p.id).sort((a,b)=>api.name(a).localeCompare(api.name(b),'pl'));
      const options=(selected,multiple=false)=>`${multiple?'':'<option value="">? — brak danych</option>'}`+sorted.map(other=>`<option value="${other.id}" ${Array.isArray(selected)?selected.includes(other.id)?'selected':'':selected===other.id?'selected':''}>${esc(api.name(other))}${other.birthYear?' ('+other.birthYear+')':''}</option>`).join('');
      const fieldset=(legend,body)=>`<fieldset><legend>${legend}</legend><div class="edit-grid">${body}</div></fieldset>`;
      const dateFields=prefix=>input(prefix+'Date',prefix==='birth'?'Data urodzenia':'Data śmierci',p[prefix+'Date'],'placeholder="RRRR, RRRR-MM lub RRRR-MM-DD" inputmode="numeric"')+input(prefix+'Year','Rok',p[prefix+'Year'],'type="number" min="1" max="9999"')+input(prefix+'DateNote','Opis przybliżonej daty',p[prefix+'DateNote'],'placeholder="np. przed 1917, koniec lat 90."');
      const placeFields=prefix=>['city','region','country'].map((part,i)=>input(prefix+'.'+part,['Miasto / wieś','Region / obwód','Kraj'][i],p[prefix][part])).join('');
      content.innerHTML=`<form id="person-edit-form" class="edit-form"><h2 id="person-name">${esc(t('Edit'))} · ${esc(api.name(p))}</h2><p class="edit-help">Dane wpisuj po polsku lub zatwierdzoną pisownią łacińską. Puste pole oznacza brak danych. Identyfikator osoby jest stały.</p><div id="edit-error" class="edit-error" role="alert" hidden></div>`+
        fieldset('Osoba',input('id','ID osoby',p.id,'readonly')+textFields.map(([key,label])=>input(key,label,p[key])).join('')+area('formerLastNames','Poprzednie nazwiska — jedno w wierszu',p.formerLastNames.join('\n'),2))+
        fieldset('Życie',`<label class="edit-field wide"><span>Status życia</span><select name="isLiving"><option value="" ${p.isLiving===null?'selected':''}>Nieustalony — ?</option><option value="true" ${p.isLiving===true?'selected':''}>Żyje — ...</option><option value="false" ${p.isLiving===false?'selected':''}>Osoba zmarła</option></select></label>`+dateFields('birth')+dateFields('death')+area('deathCircumstances','Okoliczności śmierci',p.deathCircumstances||'',2))+
        fieldset('Miejsce urodzenia',placeFields('birthPlace'))+fieldset('Miejsce śmierci',placeFields('deathPlace'))+
        fieldset('Rodzina',`<label class="edit-field"><span>Matka (Mommy)</span><select name="Mommy">${options(p.Mommy)}</select></label><label class="edit-field"><span>Ojciec (Daddy)</span><select name="Daddy">${options(p.Daddy)}</select></label><label class="edit-field wide"><span>Rodzeństwo — wybierz znane osoby (⌘ / Ctrl: kilka)</span><select name="siblings" multiple size="5">${options(p.siblings,true)}</select></label>`)+
        `<fieldset><legend>Małżeństwa</legend><div id="marriage-rows"></div><button id="add-marriage" type="button">Dodaj małżeństwo</button></fieldset>`+
        fieldset('Zdjęcie',`<div class="edit-photo wide"><img id="edit-photo-preview" ${p.photo?'src="'+esc(api.photo(p))+'"':''} alt="Podgląd zdjęcia" ${p.photo?'':'hidden'}><p id="edit-photo-empty" ${p.photo?'hidden':''}>Brak zdjęcia</p></div><label class="edit-field wide"><span>Wybierz zdjęcie (JPG, PNG, WebP, GIF; do 25 MB)</span><input id="edit-photo-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif"></label><label class="edit-checkbox wide"><input id="remove-photo" type="checkbox"> Usuń przypisanie zdjęcia</label><p class="edit-help wide">Zdjęcie zostanie zapisane bez retuszu i kadrowania. Sprawdź podgląd przed kliknięciem „Zapisz”.</p>`)+
        fieldset('Źródła i uwagi',area('sources','Źródła — jedno w wierszu',p.sources.join('\n'),5)+area('notes','Historia, uwagi, niepewne informacje',p.notes||'',6))+
        `<div class="edit-actions"><button id="cancel-edit" type="button">Anuluj</button><button id="save-person" class="primary" type="submit">Zapisz</button></div></form>`;
      const form=document.getElementById('person-edit-form'),error=document.getElementById('edit-error'),photoPreview=document.getElementById('edit-photo-preview');
      function updateDeathFields(){
        const living=form.elements.isLiving.value==='true';
        for(const name of ['deathDate','deathYear','deathDateNote'])form.elements[name].closest('label').hidden=living;
        form.elements['deathPlace.city'].closest('fieldset').hidden=living;
      }
      form.elements.isLiving.addEventListener('change',updateDeathFields);updateDeathFields();
      const showError=message=>{error.hidden=false;error.textContent=I.translate(message);error.scrollIntoView({block:'nearest',behavior:'smooth'});};
      function addMarriage(r){const row=document.createElement('div');row.className='marriage-edit';row.dataset.id=r.id;const relationOptions=data.relationships.filter(other=>other.id!==r.id).map(other=>`<option value="${other.id}" ${other.id===r.previousRelationshipId?'selected':''}>${esc(other.id+' · '+other.personIds.map(id=>api.name(data.people.find(p=>p.id===id))).join(' / '))}</option>`).join('');row.innerHTML=`<div class="marriage-edit-header"><span>${esc(r.id)}</span><button type="button" class="remove-marriage">Usuń</button></div><div class="edit-grid"><label class="edit-field wide"><span>Małżonek / małżonka</span><select data-key="spouse">${options(r.personIds.find(id=>id!==p.id))}</select></label><label class="edit-field wide"><span>Status</span><select data-key="status">${[['','Nieustalony'],['trwa','Małżeństwo trwa'],['rozwiedzeni','Rozwiedzeni'],['zakończone','Zakończone']].map(([v,label])=>`<option value="${v}" ${v===(r.status||'')?'selected':''}>${label}</option>`).join('')}</select></label>${input('','Rok początku',r.startYear,'data-key="startYear" type="number" min="1" max="9999"')}${input('','Rok końca',r.endYear,'data-key="endYear" type="number" min="1" max="9999"')}<label class="edit-field wide"><span>Poprzednie małżeństwo</span><select data-key="previousRelationshipId"><option value="">? — brak danych</option>${relationOptions}</select></label><label class="edit-field wide"><span>Źródła — jedno w wierszu</span><textarea rows="2" data-key="sources">${esc(r.sources.join('\n'))}</textarea></label></div>`;row.querySelector('.remove-marriage').onclick=()=>{row.remove();dirty=true;};document.getElementById('marriage-rows').append(row);I.dom(row);}
      baseMarriages.forEach(addMarriage);let nextRelation=Math.max(0,...data.relationships.map(r=>Number(r.id.split('_')[1])))+1;
      document.getElementById('add-marriage').onclick=()=>{addMarriage({id:'relation_'+String(nextRelation++).padStart(4,'0'),personIds:[p.id,''],status:null,startYear:null,endYear:null,previousRelationshipId:null,sources:[]});dirty=true;};
      form.addEventListener('input',()=>{dirty=true;});form.addEventListener('change',()=>{dirty=true;});
      for(const prefix of ['birth','death']){
        form.elements[prefix+'Date'].addEventListener('input',e=>{const value=e.target.value;form.elements[prefix+'Year'].value=/^\d{4}/.test(value)?value.slice(0,4):'';});
        form.elements[prefix+'Year'].addEventListener('input',e=>{const value=e.target.value;if(!value)form.elements[prefix+'Date'].value='';else if(!form.elements[prefix+'Date'].value.startsWith(value))form.elements[prefix+'Date'].value=value;});
      }
      document.getElementById('edit-photo-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;uploadBusy=true;try{if(file.size>25*1024*1024)throw Error('Maksymalny rozmiar zdjęcia: 25 MB.');if(!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type))throw Error('Wybierz zdjęcie JPG, PNG, WebP lub GIF.');const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Nie udało się odczytać zdjęcia.'));reader.readAsDataURL(file);});await GenealogyStorage.thumbnail(dataUrl);upload={dataUrl,name:file.name};removePhoto=false;document.getElementById('remove-photo').checked=false;photoPreview.src=dataUrl;photoPreview.hidden=false;document.getElementById('edit-photo-empty').hidden=true;error.hidden=true;}catch(e){upload=null;document.getElementById('edit-photo-file').value='';photoPreview.hidden=!p.photo||removePhoto;if(p.photo&&!removePhoto)photoPreview.src=api.photo(p);document.getElementById('edit-photo-empty').hidden=!!p.photo&&!removePhoto;showError(e.message);}finally{uploadBusy=false;}};
      document.getElementById('remove-photo').onchange=e=>{removePhoto=e.target.checked;if(removePhoto){upload=null;document.getElementById('edit-photo-file').value='';photoPreview.hidden=true;document.getElementById('edit-photo-empty').hidden=false;}else if(p.photo){photoPreview.src=api.photo(p);photoPreview.hidden=false;document.getElementById('edit-photo-empty').hidden=true;}};
      document.getElementById('cancel-edit').onclick=()=>{stop();api.open(p.id);};
      form.onsubmit=async event=>{event.preventDefault();const save=document.getElementById('save-person');if(save.disabled)return;if(uploadBusy){showError('Poczekaj na wczytanie podglądu zdjęcia.');return;}error.hidden=true;try{
        if(!canEdit())throw Error('Zaloguj się ponownie.');
        const changed=structuredClone(basePerson),value=name=>form.elements[name].value;
        for(const[key]of textFields)changed[key]=nullable(value(key));changed.formerLastNames=[...new Set(lines(value('formerLastNames')))];changed.sources=lines(value('sources'));changed.notes=nullable(value('notes'));changed.deathCircumstances=nullable(value('deathCircumstances'));
        for(const prefix of ['birth','death']){const raw=value(prefix+'Date').trim();if(raw==='...'&&(prefix!=='death'||value('isLiving')!=='true'))throw Error('Trzy kropki oznaczają, że osoba żyje. Wybierz status „Żyje”; dla nieznanej daty wpisz ? lub zostaw pole puste.');changed[prefix+'Date']=['','?','...'].includes(raw)?null:raw;changed[prefix+'Year']=value(prefix+'Year')?Number(value(prefix+'Year')):null;changed[prefix+'DateNote']=nullable(value(prefix+'DateNote'));}
        changed.isLiving=value('isLiving')===''?null:value('isLiving')==='true';for(const field of ['birthPlace','deathPlace'])for(const part of ['city','country','region'])changed[field][part]=nullable(value(field+'.'+part));
        for(const field of ['Mommy','Daddy'])changed[field]=value(field)||null;changed.siblings=[...form.elements.siblings.selectedOptions].map(o=>o.value);
        const marriages=[...document.querySelectorAll('.marriage-edit')].map(row=>{const get=key=>row.querySelector('[data-key="'+key+'"]').value;const original=baseMarriages.find(r=>r.id===row.dataset.id);const spouse=get('spouse');return{id:row.dataset.id,type:'małżeństwo',personIds:original?original.personIds.map(id=>id===p.id?id:spouse):[p.id,spouse],status:get('status')||null,startYear:get('startYear')?Number(get('startYear')):null,endYear:get('endYear')?Number(get('endYear')):null,previousRelationshipId:get('previousRelationshipId')||null,sources:lines(get('sources'))};});
        let translation=null;
        if(language!=='pl'){const values=Object.fromEntries(I.fields.filter(key=>JSON.stringify(changed[key]??null)!==JSON.stringify(p[key]??null)).map(key=>[key,structuredClone(changed[key]??null)]));if(Object.keys(values).length)translation={language,source:Object.fromEntries(I.fields.map(key=>[key,basePerson[key]??null])),values};for(const key of I.fields){if(Object.hasOwn(basePerson,key))changed[key]=structuredClone(basePerson[key]);else delete changed[key];}}
        validate(changed,data,marriages);save.disabled=true;save.textContent=t('Zapisywanie…');
        const next=await storage.save({person:changed,basePerson,baseMarriages,marriages,photo:upload,removePhoto,translation,baseTranslation});stop();api.apply(next,p.id);api.message(storage.mode==='project'?'Zapisano dane i zdjęcie w folderze projektu.':'Zapisano tylko w tej przeglądarce. Zmiany nie zostały opublikowane. Pobierz ZIP, aby przenieść kopię.');
      }catch(e){showError(e.message);}finally{save.disabled=false;save.textContent=t('Zapisz');}};
      if(language!=='pl'){const help=document.createElement('p');help.className='issue';help.textContent=t('Edytujesz tłumaczenie. Daty, zdjęcia i powiązania są wspólne dla wszystkich języków.');form.prepend(help);}
      const storageNote=document.createElement('p');storageNote.className='edit-storage-note';storageNote.textContent=storage.mode==='project'?t('Zmiany i zdjęcia zapiszą się w folderze projektu.'):t('Zmiany i zdjęcia zapiszą się tylko w tej przeglądarce. Nie zostaną opublikowane automatycznie.');form.querySelector('.edit-help').after(storageNote);
      I.dom(content);dialog.scrollTop=0;form.querySelector('input:not([readonly])')?.focus({preventScroll:true});
    };
    return {refresh,isDirty:()=>editing&&dirty};
  }
  return{mount};
})();

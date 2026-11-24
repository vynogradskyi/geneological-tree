/* One canonical tree; translated text never changes IDs, dates or family links. */
window.GenealogyI18n = (() => {
  const languages=['pl','ru','en'];
  const fields=['firstName','lastName','maidenName','patronymic','formerLastNames','title','occupation','notes','deathCircumstances','birthDateNote','deathDateNote','birthPlace','deathPlace'];
  let language='pl', dictionaries=window.GENEALOGY_LOCALES||{};
  try {const saved=localStorage.getItem('genealogy-language');if(languages.includes(saved))language=saved;} catch {}
  const templates=new Map(), originals=new WeakMap();
  const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  function t(source, values={}) {
    let value=dictionaries[language]?.[source]??dictionaries.pl?.[source]??source;
    return value.replace(/\{(\w+)\}/g,(match,key)=>Object.hasOwn(values,key)?String(values[key]):match);
  }
  function translate(text) {
    const trimmed=text.trim();if(!trimmed)return text;
    let value=t(trimmed);
    if(value===trimmed&&!Object.hasOwn(dictionaries.pl||{},trimmed)){
      for(const [source,pattern] of templates){const match=trimmed.match(pattern.regex);if(match){value=t(source,Object.fromEntries(pattern.keys.map((key,i)=>[key,t(match[i+1])])));break;}}
    }
    return text.slice(0,text.indexOf(trimmed))+value+text.slice(text.indexOf(trimmed)+trimmed.length);
  }
  function dom(root=document.body) {
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
    while((node=walker.nextNode())){
      if(node.parentElement?.closest('script,style,textarea,input,.sources,.node-name,.relative-link,.notes,#author-name,#person-name,#go-root,[data-i18n-ignore]'))continue;
      const previous=originals.get(node),source=previous&&node.textContent===previous.rendered?previous.source:node.textContent;
      const rendered=translate(source);node.textContent=rendered;originals.set(node,{source,rendered});
    }
    for(const element of root.querySelectorAll('[aria-label],[placeholder],[title]'))for(const attr of ['aria-label','placeholder','title']){
      if(!element.hasAttribute(attr))continue;
      const key='i18n'+attr.replace('-',''),value=element.getAttribute(attr),previous=element.dataset[key+'Rendered'];
      const source=value===previous?element.dataset[key+'Source']:value;
      element.dataset[key+'Source']=source;const rendered=translate(source);element.setAttribute(attr,rendered);element.dataset[key+'Rendered']=rendered;
    }
  }
  function person(raw,state,lang=language) {
    if(lang==='pl')return raw;
    const result=structuredClone(raw),entry=state.translations?.[lang]?.people?.[raw.id];
    if(entry)for(const key of fields)if(Object.hasOwn(entry.values,key)&&JSON.stringify(entry.source[key])===JSON.stringify(raw[key]))result[key]=structuredClone(entry.values[key]);
    return result;
  }
  function hasStale(raw,state){
    if(language==='pl')return false;
    const entry=state.translations?.[language]?.people?.[raw.id];
    return fields.some(key=>raw[key]&&!['firstName','lastName','maidenName','patronymic','formerLastNames'].includes(key)&&(!entry||!Object.hasOwn(entry.values,key)||JSON.stringify(entry.source[key])!==JSON.stringify(raw[key])));
  }
  function issue(raw,state) {
    const entry=state.translations?.[language]?.issues?.[raw.id];
    return entry&&entry.source===(raw.question||raw.topic)?entry.value:(raw.question||raw.topic);
  }
  const ready=(async()=>{
    if(location.protocol!=='file:'){
      const results=await Promise.all(languages.map(async lang=>{const response=await fetch(`locales/${lang}.json`);if(!response.ok)throw Error('Missing locale '+lang);return[lang,await response.json()];}));
      dictionaries=Object.fromEntries(results);
    }
    for(const source of Object.keys(dictionaries.pl||{}))if(source.includes('{')){
      const keys=[...source.matchAll(/\{(\w+)\}/g)].map(m=>m[1]);
      templates.set(source,{keys,regex:new RegExp('^'+source.split(/\{\w+\}/).map(escape).join('(.+?)')+'$')});
    }
    document.documentElement.lang=language;dom();
  })();
  function summary(count,generations){const plural=new Intl.PluralRules(language);return `${count} ${t('person.'+plural.select(count))} · ${generations} ${t('generation.'+plural.select(generations))}`;}
  function setLanguage(lang) {
    if(!languages.includes(lang))return;language=lang;document.documentElement.lang=lang;
    try{localStorage.setItem('genealogy-language',lang);}catch{}
  }
  return {ready,t,translate,dom,person,issue,hasStale,summary,fields,setLanguage,get language(){return language;}};
})();

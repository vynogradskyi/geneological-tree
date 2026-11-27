// HTTP uses JSON. file:// retains the generated offline snapshot.
window.GENEALOGY_READY = (async () => {
  if(location.protocol!=='file:'){
    const response=await fetch('data/tree.json',{cache:'no-store'});
    if(response.ok){
      const state=await response.json();state.translations={};
      for(const lang of ['pl','ru','en']){
        const localized=await fetch(`data/tree.${lang}.json`,{cache:'no-store'});
        if(!localized.ok)throw Error('Missing tree translation: '+lang);
        state.translations[lang]=await localized.json();
      }
      return state;
    }
  }
  return new Promise((resolve,reject)=>{
    function load(path,fallback){const script=document.createElement('script');script.src=path;script.onload=()=>window.GENEALOGY?.data?resolve(window.GENEALOGY):fallback();script.onerror=fallback;document.head.append(script);}
    load('web/family-data.js',()=>load('web/example-data.js',()=>reject(Error('Nie udało się odczytać danych przykładowych.'))));
  });
})();

/* Data access: the local editor server (scripts/editor_server.py) allows saving; everywhere else the tree is read-only. */
window.GenealogyStorage = (() => {
  const readonly = seed => ({mode:'readonly', state:structuredClone(seed)});
  async function open(seed) {
    if(location.protocol!=='http:'||!['127.0.0.1','localhost'].includes(location.hostname))return readonly(seed);
    try{
      const response=await fetch('api/state',{signal:AbortSignal.timeout(2500),cache:'no-store'});
      if(!response.ok)return readonly(seed);
      const {state,token}=await response.json();
      return {mode:'project',state,async save(request){
        const response=await fetch('api/person',{method:'POST',headers:{'Content-Type':'application/json','X-Editor-Token':token},body:JSON.stringify(request)});
        const result=await response.json();
        if(!response.ok)throw Error(result.error||'Nie udało się zapisać.');
        this.state=result.state;return this.state;
      }};
    }catch(error){console.info('Tylko podgląd:',error.message);return readonly(seed);}
  }
  // Decodes the chosen file before upload so the form can reject broken or oversized images early.
  async function checkPhoto(dataUrl) {
    const image=new Image();image.src=dataUrl;await image.decode();
    if(image.naturalWidth*image.naturalHeight>65000000)throw Error('Zdjęcie jest zbyt duże; wybierz wersję do 65 megapikseli.');
  }
  return {open,checkPhoto};
})();

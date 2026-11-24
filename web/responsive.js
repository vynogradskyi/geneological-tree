/* Move existing controls, keeping their state and listeners across breakpoints. */
window.GenealogyResponsive = (() => {
  const query='(max-width:760px), (pointer:coarse), (max-width:1000px) and (max-height:500px)',media=matchMedia(query);
  let beforeChange=()=>true,afterChange=()=>{},menuOpener=null,searchOpener=null;
  const $=id=>document.getElementById(id);
  function init(){
    const moves=[['identity','desktop-identity','menu-project'],['header-actions','desktop-actions','menu-account'],['editor-status','desktop-status','menu-status'],['layout-toolbar','desktop-layout','menu-layout'],['page-footer','desktop-footer','menu-about'],['search-box','desktop-search','mobile-search-slot'],['view-controls','desktop-view','mobile-quick-actions']];
    const menu=$('mobile-menu'),search=$('search-dialog');
    function refresh(){
      document.body.classList.toggle('mobile-view',media.matches);
      for(const[id,desktop,mobile]of moves)$(media.matches?mobile:desktop).append($(id));
      if(!media.matches){menu.close();search.close();}
      afterChange(media.matches);
    }
    $('open-mobile-menu').onclick=()=>{menuOpener=document.activeElement;menu.showModal();};
    $('close-mobile-menu').onclick=()=>menu.close();menu.addEventListener('close',()=>menuOpener?.focus());
    $('open-mobile-search').onclick=()=>{searchOpener=$('open-mobile-menu');menu.close();search.showModal();$('person-search').focus();};
    $('close-search').onclick=()=>search.close();search.addEventListener('close',()=>searchOpener?.focus());
    for(const dialog of [menu,search])dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
    $('toggle-person-size').onclick=()=>{const full=$('person-dialog').classList.toggle('sheet-expanded');$('toggle-person-size').setAttribute('aria-expanded',String(full));$('toggle-person-size').textContent=window.GenealogyI18n.t(full?'Zwiń':'Rozwiń');};
    $('show-in-tree').onclick=()=>{$('person-dialog').close();};
    $('family-login').addEventListener('click',()=>menu.close());
    const visual=()=>document.documentElement.style.setProperty('--visual-height',(window.visualViewport?.height||innerHeight)+'px');window.visualViewport?.addEventListener('resize',visual);visual();
    media.addEventListener('change',refresh);refresh();
  }
  function closeSearch(){if($('search-dialog').open)$('search-dialog').close();}
  function closeMenu(){if($('mobile-menu').open)$('mobile-menu').close();}
  return {init,closeSearch,closeMenu,onChange(callback){afterChange=callback;},get mobile(){return media.matches;}};
})();

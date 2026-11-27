/* Sources stay in the current person's dialog; pointer, keyboard and touch share one disclosure. */
window.GenealogySourceInfo = (() => {
  function mount(root, dialog) {
    const button=root.querySelector('.source-info-button'),panel=root.querySelector('.sources-popover');
    if(!button||!panel)return ()=>{};
    const controller=new AbortController(),options={signal:controller.signal};
    let pinned=false,hovered=false;
    function close(){pinned=false;panel.hidden=true;button.setAttribute('aria-expanded','false');}
    function show(){
      const anchor=button.getBoundingClientRect(),hero=root.closest('.details-hero').getBoundingClientRect();
      const top=Math.max(16,Math.min(anchor.bottom,window.innerHeight-96));
      panel.style.top=(top-hero.top)+'px';
      panel.style.maxHeight=Math.max(60,Math.min(340,window.innerHeight-top-16))+'px';
      panel.hidden=false;button.setAttribute('aria-expanded','true');
    }
    root.addEventListener('pointerenter',event=>{if(event.pointerType==='touch')return;hovered=true;show();},options);
    root.addEventListener('pointerleave',()=>{hovered=false;if(!pinned&&!root.contains(document.activeElement))close();},options);
    root.addEventListener('focusin',show,options);
    root.addEventListener('focusout',()=>{queueMicrotask(()=>{if(!pinned&&!hovered&&!root.contains(document.activeElement))close();});},options);
    button.addEventListener('click',event=>{event.stopPropagation();if(pinned)close();else{pinned=true;show();}},options);
    dialog.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){event.preventDefault();event.stopImmediatePropagation();button.focus({preventScroll:true});close();}}, {...options,capture:true});
    document.addEventListener('click',event=>{if(!root.contains(event.target))close();},{...options,capture:true});
    dialog.addEventListener('close',close,options);
    window.addEventListener('resize',()=>{requestAnimationFrame(()=>{if(!panel.hidden)show();});},options);
    const observer=window.ResizeObserver?new ResizeObserver(()=>{if(!panel.hidden)show();}):null;
    observer?.observe(root.closest('.details-hero'));
    return ()=>{close();controller.abort();observer?.disconnect();};
  }
  return {mount};
})();

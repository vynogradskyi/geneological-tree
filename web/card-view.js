/* Shared visual geometry; resizing never changes family records or relationships. */
window.GenealogyCardView = (() => {
  const metrics=window.GenealogyCardMetrics;
  function normalize(model){
    const first=Object.values(model.nodes)[0];if(!first)return;
    const sx=metrics.width/first.w,sy=metrics.height/first.h;
    if(Math.abs(sx-1)<.0001&&Math.abs(sy-1)<.0001)return;
    for(const node of Object.values(model.nodes)){node.x*=sx;node.y*=sy;node.w=metrics.width;node.h=metrics.height;}
    for(const edge of model.edges){edge.paths=edge.paths.map(path=>path.map(([x,y])=>[x*sx,y*sy]));edge.labels=edge.labels.map(label=>({...label,x:label.x*sx,y:label.y*sy}));}
    model.width*=sx;model.height*=sy;
  }
  function migratePlacement(cache,model){
    try{
      const before=JSON.parse(cache.signature),after=Object.entries(model.nodes).sort(([a],[b])=>a.localeCompare(b));
      if(JSON.stringify(before.ranks)!==JSON.stringify(Object.entries(model.ranks).sort(([a],[b])=>a.localeCompare(b))))return null;
      const edges=model.edges.map(e=>[e.kind,e.tail,e.head]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
      if(JSON.stringify(before.edges)!==JSON.stringify(edges)||before.nodes.length!==after.length)return null;
      const scale=after[0][1].w/before.nodes[0][1].w;
      if(Math.abs(scale-1)<.001)return null;
      for(let i=0;i<after.length;i++){
        const [oldId,oldNode]=before.nodes[i],[id,node]=after[i];
        if(id!==oldId||Math.abs(node.w/oldNode.w-scale)>.001||Math.abs(node.h/oldNode.h-scale)>.001)return null;
      }
      return Object.fromEntries(Object.entries(cache.positions).map(([id,x])=>[id,x*scale]));
    }catch{return null;}
  }
  function fit(button){
    const names=button.querySelector('.node-names'),subtitle=button.querySelector('.node-subtitle'),dates=button.querySelector('.node-dates');
    if(!names||!dates)return;
    const available=button.clientHeight-22-metrics.photo-8-dates.offsetHeight-(subtitle?.offsetHeight||0);
    for(let size=16;size>=14;size--){names.style.fontSize=size+'px';names.style.lineHeight=(size+3)+'px';if(names.offsetHeight<=available)break;}
  }
  function drawPDF(ctx,{node:n,branch,theme,root,image,names,subtitle,dates,initials,noPhoto}){
    const cx=n.x+n.w/2,width=metrics.photo;
    ctx.setLineDash([]);ctx.fillStyle=theme?.tint||'#fff';ctx.strokeStyle=root?'#244f3c':'#cdd8cd';ctx.lineWidth=root?2:1;
    ctx.beginPath();ctx.roundRect(n.x,n.y,n.w,n.h,12);ctx.fill();ctx.stroke();
    ctx.save();ctx.beginPath();ctx.roundRect(n.x,n.y,n.w,n.h,12);ctx.clip();
    if(theme){ctx.fillStyle=theme.bands[0];ctx.fillRect(n.x,n.y,n.w/2,5);ctx.fillStyle=theme.bands[1];ctx.fillRect(n.x+n.w/2,n.y,n.w/2,5);}
    else {ctx.fillStyle=root?'#244f3c':branch==='father'?'#537d98':branch==='other'?'#879088':'#5d8463';ctx.fillRect(n.x,n.y,n.w,4);}ctx.restore();
    const px=cx-width/2,py=n.y+12;ctx.fillStyle='#f0f2ec';ctx.beginPath();ctx.roundRect(px,py,width,width,6);ctx.fill();
    function font(size,bold=false){ctx.font=`${bold?'bold ':''}${size}px Arial`;}
    function wrap(value,size,bold=false){font(size,bold);const lines=[];let line='';for(const word of String(value||'').split(/\s+/)){if(line&&ctx.measureText(line+' '+word).width>width){lines.push(line);line='';}if(ctx.measureText(word).width>width){for(const c of word){if(ctx.measureText(line+c).width>width){lines.push(line);line='';}line+=c;}}else line=line?line+' '+word:word;}if(line)lines.push(line);return lines;}
    ctx.textAlign='center';
    if(image){const scale=Math.min(width/image.width,width/image.height);ctx.drawImage(image,px+(width-image.width*scale)/2,py+(width-image.height*scale)/2,image.width*scale,image.height*scale);}
    else {ctx.fillStyle='#8c9f8f';ctx.font='44px Georgia';ctx.fillText(initials,cx,py+width/2);font(12);ctx.fillText(noPhoto,cx,py+width/2+26);}
    const dateLines=wrap(dates,14,true),subtitleLines=wrap(subtitle,12).slice(0,2);
    const available=n.h-22-width-8-dateLines.length*16-5-subtitleLines.length*14-(subtitle?4:0);
    let size=16,nameLines;
    do{nameLines=names.flatMap(name=>wrap(name,size,true));if(nameLines.length*(size+3)<=available||size<=14)break;size--;}while(true);
    let y=py+width+8+size;ctx.fillStyle='#23392f';font(size,true);nameLines.forEach(line=>{ctx.fillText(line,cx,y);y+=size+3;});
    ctx.fillStyle='#65736a';font(12);y+=1;subtitleLines.forEach(line=>{ctx.fillText(line,cx,y);y+=14;});
    ctx.fillStyle='#23392f';font(14,true);dateLines.forEach((line,i)=>ctx.fillText(line,cx,n.y+n.h-12-(dateLines.length-i-1)*16));
  }
  return {normalize,migratePlacement,fit,drawPDF};
})();

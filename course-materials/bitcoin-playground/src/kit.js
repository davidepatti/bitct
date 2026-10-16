/* Shared toolkit for interactive demos: page shell, controls, charts, seeded randomness. */
(function(root){
  'use strict';
  const ink='#29323c',muted='#6b736f',grid='#e7e1d4',line='#dcd7ca';
  const colors={purple:'#8256d8',blue:'#3177c8',green:'#47965d',orange:'#db901e',red:'#ce5750',teal:'#23877f',yellow:'#e7b53c',grey:'#9a978e',ink,muted};
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

  /* Seeded randomness: classroom runs are repeatable until a new seed is drawn. */
  function rng(seed=1){let a=seed>>>0;return function(){a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
  const expo=(r,mean)=>-Math.log(1-r())*mean;
  function poisson(r,lambda){if(lambda>40)return Math.max(0,Math.round(lambda+Math.sqrt(lambda)*gauss(r)));let L=Math.exp(-lambda),k=0,p=1;do{k++;p*=r();}while(p>L);return k-1;}
  function gauss(r){let u=0,v=0;while(!u)u=r();while(!v)v=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
  const newSeed=()=>(Math.floor(Math.random()*2**31)>>>0)||7;

  /* Number formatting */
  const group=n=>Math.round(n).toLocaleString('en-US');
  function fmt(n,d=0){if(!Number.isFinite(n))return '∞';return n.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});}
  function pct(x,d){if(!Number.isFinite(x))return '—';const v=x*100;if(d===undefined)d=v===0||v>=10?0:v>=1?1:v>=0.1?2:3;if(v>0&&v<0.001)return '< 0.001%';return fmt(v,d)+'%';}
  function sci(x,d=2){if(x===0)return '0';if(!Number.isFinite(x))return '∞';const e=Math.floor(Math.log10(Math.abs(x)));if(e>=-3&&e<6)return fmt(x,e<0?d+Math.abs(e)-1:e<2?d:0);const m=x/10**e;return `${m.toFixed(1)} × 10${sup(e)}`;}
  const sup=n=>String(n).split('').map(c=>({'-':'⁻','0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹'}[c])).join('');
  function duration(minutes){const sec=minutes*60;if(sec<1e-3)return '< 1 ms';if(sec<1)return `${fmt(sec*1000)} ms`;if(minutes<1)return `${fmt(sec)} s`;if(minutes<90)return `${fmt(minutes,minutes<10?1:0)} min`;const h=minutes/60;if(h<48)return `${fmt(h,1)} h`;const days=h/24;if(days<730)return `${fmt(days,days<10?1:0)} days`;return `${sci(days/365.25)} years`;}

  /* Controls. Each control writes state[key] and calls onChange. */
  function slider({key,label,min,max,step=1,value,format=v=>v,log=false,hint=''}){
    const pos=log?Math.log(value)/Math.log(10):value;
    return `<label class="ctl" data-ctl="${key}"><span class="ctl-top"><span class="ctl-label">${label}</span><output id="out-${key}">${format(value)}</output></span>
      <input type="range" data-key="${key}" ${log?'data-log="1"':''} min="${log?Math.log10(min):min}" max="${log?Math.log10(max):max}" step="${log?0.01:step}" value="${pos}" aria-label="${esc(label.replace(/<[^>]+>/g,''))}">${hint?`<span class="ctl-hint">${hint}</span>`:''}</label>`;
  }
  function segmented({key,label,options,value}){
    return `<div class="ctl ctl-seg" data-ctl="${key}"><span class="ctl-top"><span class="ctl-label">${label}</span></span><div class="seg" role="group" aria-label="${esc(label)}">${options.map(o=>`<button type="button" data-seg="${key}" data-value="${esc(o.value)}" aria-pressed="${String(o.value)===String(value)}">${o.label}</button>`).join('')}</div></div>`;
  }
  function bindControls(scope,state,specs,onChange){
    scope.querySelectorAll('input[type=range][data-key]').forEach(input=>{
      const key=input.dataset.key,spec=specs[key]||{};
      input.addEventListener('input',()=>{let v=Number(input.value);if(input.dataset.log)v=10**v;if(spec.round)v=spec.round(v);state[key]=v;const out=scope.querySelector('#out-'+key);if(out)out.textContent=(spec.format||String)(v);onChange(key);});
    });
    scope.querySelectorAll('[data-seg]').forEach(b=>b.addEventListener('click',()=>{
      const key=b.dataset.seg,raw=b.dataset.value,num=Number(raw);state[key]=raw!==''&&!Number.isNaN(num)?num:raw;
      scope.querySelectorAll(`[data-seg="${key}"]`).forEach(x=>x.setAttribute('aria-pressed',String(x===b)));onChange(key);
    }));
  }
  function setSlider(scope,key,value,spec={}){const input=scope.querySelector(`input[data-key="${key}"]`);if(!input)return;input.value=input.dataset.log?Math.log10(value):value;const out=scope.querySelector('#out-'+key);if(out)out.textContent=(spec.format||String)(value);}
  function setSeg(scope,key,value){scope.querySelectorAll(`[data-seg="${key}"]`).forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.value===String(value))));}

  /* Page shell shared by all demos, matching the transaction tool's layout. */
  function page(demo,{tabs='',layer='',status='',controls='',legend='',aside='',notes=''}){
    return `<div class="tool-heading"><div><p class="eyebrow" style="margin-bottom:8px">TOOL ${demo.number} · ${esc(demo.module.toUpperCase())} · ${esc(demo.moduleName.toUpperCase())}</p><h1>${esc(demo.title)}</h1></div><div class="heading-actions"><button class="quiet" id="fullscreen" aria-pressed="false">⛶ &nbsp; Focus</button><button class="quiet" id="hub">← Playground</button></div></div>
      ${tabs?`<nav class="demo-tabs" aria-label="Views">${tabs}</nav>`:''}
      <div class="workbench demo-bench"><div class="canvas-wrap"><div class="canvas-meta"><p class="eyebrow" id="layer">${layer}</p><span class="scene-position" id="scene-status">${status}</span></div><div class="scene demo-scene" id="scene"></div><div class="demo-controls" id="controls">${controls}</div>${legend?`<div class="scene-legend" id="legend">${legend}</div>`:''}</div>
      <aside class="narration demo-aside" id="aside" aria-live="polite">${aside}</aside></div>
      ${notes?`<details class="teaching-detail"><summary>Look closer · model, assumptions and limits</summary>${notes}</details>`:''}
      <footer class="tool-footer"><span>Teaching simulation · toy model · no keys, coins or network connections</span><span>Bitcoin Playground / ${root.PlaygroundKit.version}</span></footer>`;
  }
  function bindShell(main){
    const fs=main.querySelector('#fullscreen'),label=()=>{const on=document.body.classList.contains('fullscreen');fs.setAttribute('aria-pressed',String(on));fs.innerHTML=on?'⛶ &nbsp; Exit focus':'⛶ &nbsp; Focus';};
    fs.onclick=()=>{document.body.classList.toggle('fullscreen');label();};label();
    main.querySelector('#hub').onclick=()=>{location.hash='hub';};
  }
  function tabs(key,options,value){return options.map(o=>`<button type="button" class="demo-tab" data-seg="${key}" data-value="${esc(o.value)}" aria-pressed="${String(o.value)===String(value)}">${o.label}</button>`).join('');}
  const legendItem=(color,label,shape='square')=>`<span class="legend-item"><i class="legend-dot ${shape}" style="background:${color}"></i>${label}</span>`;
  function readouts(items){return `<dl class="readouts">${items.map(([k,v,cls=''])=>`<div class="${cls}"><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;}
  function asideBlock({eyebrow='WHAT TO NOTICE',title,text,takeaway,stats,tries}){
    return `<p class="eyebrow">${eyebrow}</p><h2>${title}</h2>${text?`<p>${text}</p>`:''}${takeaway?`<div class="takeaway">${takeaway}</div>`:''}${stats?`<div class="demo-stats">${stats}</div>`:''}${tries?`<div class="try-this"><p class="eyebrow">TRY THIS</p><ol>${tries.map(t=>`<li>${t}</li>`).join('')}</ol></div>`:''}`;
  }

  /* SVG helpers */
  const svg=(w,h,content,title)=>`<svg class="scene-svg demo-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}" xmlns="http://www.w3.org/2000/svg"><defs><marker id="k-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1 9 5 1 9" fill="none" stroke="context-stroke" stroke-width="1.8" stroke-linejoin="round"/></marker></defs>${content}</svg>`;
  /* Inline style (not presentation attributes) so the transaction tool's .scene-svg text rules cannot override demo text. */
  const t=(x,y,s,{size=15,weight=500,anchor='start',fill=ink,cls='',extra=''}={})=>`<text x="${x}" y="${y}" style="font-size:${size}px;font-weight:${weight};fill:${fill}" text-anchor="${anchor}" class="${cls}" ${extra}>${esc(s)}</text>`;
  function niceTicks(min,max,count=5){const span=max-min||1,step0=span/count,mag=10**Math.floor(Math.log10(step0)),norm=step0/mag,step=(norm<1.5?1:norm<3?2:norm<7?5:10)*mag,out=[];for(let v=Math.ceil(min/step-1e-9)*step;v<=max+step*1e-9;v+=step)out.push(+v.toFixed(12));return out;}
  function logTicks(min,max){const out=[];for(let e=Math.floor(Math.log10(min));e<=Math.ceil(Math.log10(max));e++){const v=10**e;if(v>=min*0.999&&v<=max*1.001)out.push(v);}return out;}
  /* plot returns an SVG group for a simple x/y chart. */
  function plot(o){
    const {x=0,y=0,w=400,h=240,xr,yr,xlog=false,ylog=false,xlabel='',ylabel='',xfmt=v=>fmt(v),yfmt=v=>fmt(v),series=[],hlines=[],vlines=[],bands=[],xticks,yticks,dots=[],texts=[]}=o;
    const sx=v=>x+(xlog?(Math.log10(v)-Math.log10(xr[0]))/(Math.log10(xr[1])-Math.log10(xr[0])):(v-xr[0])/(xr[1]-xr[0]))*w;
    const sy=v=>y+h-(ylog?(Math.log10(clamp(v,yr[0],yr[1]))-Math.log10(yr[0]))/(Math.log10(yr[1])-Math.log10(yr[0])):(clamp(v,yr[0]-(yr[1]-yr[0])*0.05,yr[1]+(yr[1]-yr[0])*0.05)-yr[0])/(yr[1]-yr[0]))*h;
    const xt=xticks||(xlog?logTicks(...xr):niceTicks(...xr)),yt=yticks||(ylog?logTicks(...yr):niceTicks(...yr,4));
    let g=`<g class="plot">`;
    bands.forEach(b=>{g+=`<rect x="${sx(b.from)}" y="${y}" width="${Math.max(0,sx(b.to)-sx(b.from))}" height="${h}" fill="${b.color}" opacity="${b.opacity||0.12}"/>`;});
    yt.forEach(v=>{g+=`<line x1="${x}" x2="${x+w}" y1="${sy(v)}" y2="${sy(v)}" stroke="${grid}" stroke-width="1"/>`+t(x-8,sy(v)+4,yfmt(v),{size:11,anchor:'end',fill:muted});});
    xt.forEach(v=>{g+=`<line x1="${sx(v)}" x2="${sx(v)}" y1="${y+h}" y2="${y+h+5}" stroke="${line}"/>`+t(sx(v),y+h+19,xfmt(v),{size:11,anchor:'middle',fill:muted});});
    g+=`<line x1="${x}" x2="${x+w}" y1="${y+h}" y2="${y+h}" stroke="#bdb6a6" stroke-width="1.3"/><line x1="${x}" x2="${x}" y1="${y}" y2="${y+h}" stroke="#bdb6a6" stroke-width="1.3"/>`;
    if(xlabel)g+=t(x+w/2,y+h+38,xlabel,{size:12,anchor:'middle',fill:muted,weight:600});
    if(ylabel)g+=t(x-48,y+h/2,ylabel,{size:12,anchor:'middle',fill:muted,weight:600,extra:`transform="rotate(-90 ${x-48} ${y+h/2})"`});
    hlines.forEach(l=>{g+=`<line x1="${x}" x2="${x+w}" y1="${sy(l.y)}" y2="${sy(l.y)}" stroke="${l.color||muted}" stroke-width="${l.width||1.5}" stroke-dasharray="${l.dash||'5 5'}"/>`;if(l.label)g+=t(l.anchor==='start'?x+6:x+w-4,sy(l.y)-6,l.label,{size:11,anchor:l.anchor||'end',fill:l.color||muted,weight:600});});
    vlines.forEach(l=>{g+=`<line x1="${sx(l.x)}" x2="${sx(l.x)}" y1="${y}" y2="${y+h}" stroke="${l.color||muted}" stroke-width="${l.width||1.5}" stroke-dasharray="${l.dash||'5 5'}"/>`;if(l.label)g+=t(sx(l.x)+(l.anchor==='end'?-6:6),y+14+(l.dy||0),l.label,{size:11,anchor:l.anchor||'start',fill:l.color||muted,weight:600});});
    series.forEach(s=>{
      const pts=s.pts.filter(p=>Number.isFinite(p[0])&&Number.isFinite(p[1])&&(!ylog||p[1]>0)&&(!xlog||p[0]>0));if(!pts.length)return;
      let d='';pts.forEach((p,i)=>{const X=sx(p[0]),Y=sy(p[1]);if(i===0)d+=`M${X.toFixed(1)} ${Y.toFixed(1)}`;else if(s.step)d+=`H${X.toFixed(1)}V${Y.toFixed(1)}`;else d+=`L${X.toFixed(1)} ${Y.toFixed(1)}`;});
      if(s.area)g+=`<path d="${d}L${sx(pts.at(-1)[0]).toFixed(1)} ${y+h}L${sx(pts[0][0]).toFixed(1)} ${y+h}Z" fill="${s.color}" opacity="${s.area}"/>`;
      g+=`<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.width||2.4}" stroke-linejoin="round" stroke-linecap="round" ${s.dash?`stroke-dasharray="${s.dash}"`:''} opacity="${s.opacity||1}"/>`;
      if(s.label){const p=pts.at(-1);g+=t(sx(p[0])+6,sy(p[1])+4,s.label,{size:12,fill:s.color,weight:700});}
    });
    dots.forEach(d=>{g+=`<circle cx="${sx(d.x)}" cy="${sy(d.y)}" r="${d.r||5}" fill="${d.color||ink}" stroke="${d.stroke||'#fffdf7'}" stroke-width="2"/>`;if(d.label)g+=t(sx(d.x)+(d.anchor==='end'?-9:9),sy(d.y)+(d.dy||-8),d.label,{size:12,fill:d.textColor||d.color||ink,weight:700,anchor:d.anchor||'start'});});
    texts.forEach(s=>{g+=t(sx(s.x),sy(s.y),s.text,{size:s.size||12,fill:s.color||muted,anchor:s.anchor||'start',weight:s.weight||600});});
    return g+'</g>';
  }
  function bars(o){
    const {x=0,y=0,w=400,h=200,values,max,colors:cs,labels=[],gap=0.18,vfmt,yfmt=v=>fmt(v),ylabel=''}=o;
    const m=max||Math.max(1e-12,...values),bw=w/values.length;let g='';
    niceTicks(0,m,4).forEach(v=>{const Y=y+h-v/m*h;g+=`<line x1="${x}" x2="${x+w}" y1="${Y}" y2="${Y}" stroke="${grid}"/>`+t(x-8,Y+4,yfmt(v),{size:11,anchor:'end',fill:muted});});
    values.forEach((v,i)=>{const bh=Math.max(0,v/m*h),X=x+i*bw+bw*gap/2;g+=`<rect x="${X}" y="${y+h-bh}" width="${bw*(1-gap)}" height="${bh}" rx="2" fill="${Array.isArray(cs)?cs[i]:cs}"/>`;if(labels[i]!==undefined&&labels[i]!=='')g+=t(X+bw*(1-gap)/2,y+h+16,labels[i],{size:11,anchor:'middle',fill:muted});if(vfmt&&v>0)g+=t(X+bw*(1-gap)/2,y+h-bh-6,vfmt(v),{size:11,anchor:'middle',weight:700});});
    g+=`<line x1="${x}" x2="${x+w}" y1="${y+h}" y2="${y+h}" stroke="#bdb6a6" stroke-width="1.3"/>`;
    if(ylabel)g+=t(x-46,y+h/2,ylabel,{size:12,anchor:'middle',fill:muted,weight:600,extra:`transform="rotate(-90 ${x-46} ${y+h/2})"`});
    return g;
  }

  /* Animation loop with automatic cancellation when a tool unmounts. */
  function loop(step){let raf=0,last=0,on=true;const tick=now=>{if(!on)return;const dt=last?Math.min(100,now-last):16;last=now;if(step(dt)===false){on=false;return;}raf=requestAnimationFrame(tick);};raf=requestAnimationFrame(tick);return()=>{on=false;cancelAnimationFrame(raf);};}
  const reduced=()=>root.matchMedia?root.matchMedia('(prefers-reduced-motion: reduce)').matches:false;
  /* Map a hash or label to a stable, readable hue. */
  const hue=hex=>parseInt(hex.slice(0,4),16)%360;

  const demos=[];
  function register(demo){demos.push(demo);demos.sort((a,b)=>Number(a.number)-Number(b.number));}

  root.PlaygroundKit={version:'2.0',sup,colors,esc,clamp,rng,expo,poisson,gauss,newSeed,fmt,group,pct,sci,duration,slider,segmented,bindControls,setSlider,setSeg,page,bindShell,tabs,legendItem,readouts,asideBlock,svg,t,plot,bars,niceTicks,loop,reduced,hue,register,demos};
})(typeof window!=='undefined'?window:globalThis);

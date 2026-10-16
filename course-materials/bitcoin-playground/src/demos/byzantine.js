/* Tool · Byzantine generals: Lamport–Shostak–Pease oral-messages algorithm OM(m). */
(function(root){
  'use strict';
  const A='attack',R='retreat',flip=v=>v===A?R:A;
  /* What a traitor sends instead of the true value. Deterministic, so runs are repeatable. */
  function lie(strategy,sender,receiver,value,path){
    if(strategy==='flip')return flip(value);
    if(strategy==='split')return receiver%2?R:A;
    let h=7;for(const c of path+'|'+sender+'>'+receiver)h=(h*31+c.charCodeAt(0))>>>0;return h%2?A:R;
  }
  const majority=vals=>{const a=vals.filter(v=>v===A).length;return a>vals.length-a?A:R;}; // ties → retreat
  /* OM(m): returns, for each lieutenant, the value it uses; also records first-round orders and per-lieutenant evidence. */
  function om(m,commander,lieutenants,value,ctx,path=''){
    const received=new Map();
    for(const l of lieutenants){const v=ctx.traitors.has(commander)?lie(ctx.strategy,commander,l,value,path):value;received.set(l,v);ctx.messages++;}
    if(m===0)return {decided:received,received,relayed:new Map()};
    const relayed=new Map();
    for(const i of lieutenants)relayed.set(i,om(m-1,i,lieutenants.filter(x=>x!==i),received.get(i),ctx,path+i).decided);
    const decided=new Map();
    for(const j of lieutenants){const vals=[received.get(j)];for(const i of lieutenants)if(i!==j)vals.push(relayed.get(i).get(j));decided.set(j,majority(vals));}
    return {decided,received,relayed};
  }
  function run({n,rounds,traitors,strategy='split',order=A}){
    const ctx={traitors:new Set(traitors),strategy,messages:0},lts=Array.from({length:n-1},(_,i)=>i+1);
    const res=om(rounds,0,lts,order,ctx);
    const loyal=lts.filter(l=>!ctx.traitors.has(l)),decisions=loyal.map(l=>res.decided.get(l));
    const agree=decisions.every(d=>d===decisions[0]),follows=ctx.traitors.has(0)||decisions.every(d=>d===order);
    return {...res,messages:ctx.messages,loyal,agree,follows,ok:agree&&follows};
  }
  const guaranteed=(n,rounds,f)=>n>3*f&&rounds>=f;
  /* Exhaustive check: every placement of f traitors, every strategy, both orders. */
  function exhaustive(n,rounds,f){let total=0,fail=0;const combos=(arr,k)=>k===0?[[]]:arr.flatMap((x,i)=>combos(arr.slice(i+1),k-1).map(c=>[x,...c]));
    for(const tr of combos(Array.from({length:n},(_,i)=>i),f))for(const strategy of ['split','flip','random'])for(const order of [A,R]){total++;if(!run({n,rounds,traitors:tr,strategy,order}).ok)fail++;}return {total,fail};}
  const model={A,R,run,om,majority,guaranteed,exhaustive};
  if(typeof module!=='undefined'&&module.exports){module.exports=model;return;}

  const K=root.PlaygroundKit,{t,svg,colors:C,fmt}=K;
  const col=v=>v===A?C.orange:C.blue,short=v=>v===A?'A':'R';
  K.register({id:'byzantine-generals',number:'03',module:'M 1.1',moduleName:'Motivations',kind:'Agreement',color:C.purple,
    title:'The Byzantine generals',
    description:'Generals must agree to attack or retreat, but some are traitors who send different orders to different people. Add traitors and message rounds and see when agreement holds.',
    preview(){let g='<circle cx="160" cy="84" r="22" fill="#e9e5da" stroke="#29323c" stroke-width="1.5"/>';[0,1,2,3,4].forEach(i=>{const a=-Math.PI/2+i*2*Math.PI/5,x=160+Math.cos(a)*64,y=84+Math.sin(a)*62;g+=`<circle cx="${x}" cy="${y}" r="13" fill="${i===3?'#f6d6d3':i%2?'#bfdaef':'#f7daa0'}" stroke="${i===3?'#ce5750':'#29323c'}" stroke-width="1.5"/>`;if(i)g+=`<path d="M160 22L${x} ${y-13}" stroke="#a49c8c" stroke-dasharray="3 3"/>`;});return `<svg viewBox="0 0 320 168">${g}</svg>`;},
    mount(main){
      const s={n:4,rounds:1,traitors:new Set([2]),strategy:'split',order:A,check:null};
      main.innerHTML=K.page(this,{layer:'Oral messages · OM(m)',
        controls:K.segmented({key:'n',label:'Generals n',options:[3,4,5,6,7].map(v=>({value:v,label:String(v)})),value:s.n})+K.segmented({key:'rounds',label:'Relay rounds m',options:[0,1,2,3].map(v=>({value:v,label:String(v)})),value:s.rounds})+K.segmented({key:'strategy',label:'Traitors’ strategy',options:[{value:'split',label:'Split the camp'},{value:'flip',label:'Always lie'},{value:'random',label:'Random'}],value:s.strategy})+K.segmented({key:'order',label:'Commander’s order',options:[{value:A,label:'Attack'},{value:R,label:'Retreat'}],value:s.order})+
          `<div class="demo-actions"><span class="note">Click a general to make them a traitor (or loyal again).</span><span class="spacer"></span><button id="check">Check every placement</button></div>`,
        legend:K.legendItem(C.orange,'Attack','round')+K.legendItem(C.blue,'Retreat','round')+K.legendItem(C.red,'Traitor','round')+K.legendItem('#e9e5da','Commander (crown)','round'),
        notes:`<ul><li><strong>Problem</strong> (Lamport, Shostak and Pease, 1982). A commander sends an order; lieutenants must all decide the same (agreement), and if the commander is loyal they must follow the order (validity). Traitors may say different things to different generals.</li><li><strong>OM(m).</strong> In OM(0) each lieutenant simply uses what it received. In OM(m) each lieutenant also relays what it heard to the others using OM(m−1), then takes the majority of all versions (ties count as retreat). With messages that cannot be forged and at most m traitors, OM(m) succeeds whenever n &gt; 3m. With three generals and one traitor, no oral-message algorithm can work.</li><li><strong>Cost.</strong> Messages grow roughly as nᵐ⁺¹, and the protocol needs a known list of participants. Signed messages help, but someone still decides who the generals are.</li><li><strong>Bridge to Bitcoin.</strong> On an open network anyone can create many identities, so counting voters fails (Sybil attack). Bitcoin replaces votes with proof of work and agreement on the most-work chain, which is probabilistic rather than final after a fixed number of rounds.</li></ul>`});
      const scene=main.querySelector('#scene'),controls=main.querySelector('#controls'),aside=main.querySelector('#aside'),status=main.querySelector('#scene-status');
      K.bindControls(controls,s,{},key=>{if(key==='n')s.traitors=new Set([...s.traitors].filter(x=>x<s.n));s.check=null;draw();});
      controls.querySelector('#check').onclick=()=>{s.check=exhaustive(s.n,s.rounds,s.traitors.size);draw();};
      const toggle=i=>{if(s.traitors.has(i))s.traitors.delete(i);else s.traitors.add(i);s.check=null;draw();scene.querySelector(`[data-general="${i}"]`)?.focus();};
      scene.addEventListener('click',e=>{const el=e.target.closest('[data-general]');if(el)toggle(Number(el.dataset.general));});
      scene.addEventListener('keydown',e=>{const el=e.target.closest('[data-general]');if(el&&(e.key==='Enter'||e.key===' ')){e.preventDefault();toggle(Number(el.dataset.general));}});
      function draw(){
        const res=run({n:s.n,rounds:s.rounds,traitors:[...s.traitors],strategy:s.strategy,order:s.order}),f=s.traitors.size,gd=guaranteed(s.n,s.rounds,f);
        const cx=235,cy=255,Rr=170,P=i=>{const a=-Math.PI/2+i*2*Math.PI/s.n;return [cx+Math.cos(a)*Rr,cy+Math.sin(a)*Rr*0.9];};let g='';
        g+=`<path d="M${cx-40} ${cy+30}V${cy-14}L${cx-28} ${cy-26}L${cx-16} ${cy-14}V${cy-30}H${cx+16}V${cy-14}L${cx+28} ${cy-26}L${cx+40} ${cy-14}V${cy+30}Z" fill="#e9e5da" stroke="#8f897c" stroke-width="1.5"/>`+t(cx,cy+52,'the city',{size:11,anchor:'middle',fill:C.muted});
        const [x0,y0]=P(0);
        for(let i=1;i<s.n;i++){const [x,y]=P(i),v=res.received.get(i),dx=x-x0,dy=y-y0,L=Math.hypot(dx,dy);g+=`<path d="M${x0+dx/L*32} ${y0+dy/L*32}L${x-dx/L*34} ${y-dy/L*34}" stroke="${col(v)}" stroke-width="2" ${s.traitors.has(0)&&v!==s.order?'stroke-dasharray="6 4"':''} marker-end="url(#k-arrow)" opacity=".8"/>`+t(x0+dx*0.55+(dy>0?10:-10)*Math.sign(dx||1),y0+dy*0.55,short(v),{size:12,weight:700,fill:col(v),anchor:'middle'});}
        for(let i=0;i<s.n;i++){const [x,y]=P(i),tr=s.traitors.has(i),dec=i?res.decided.get(i):s.order;
          g+=`<g data-pick="1" data-general="${i}" tabindex="0" role="button" aria-label="General ${i}${i===0?' (commander)':''}${tr?', traitor':''}"><circle cx="${x}" cy="${y}" r="28" fill="${tr?'#f6d6d3':i===0?'#e9e5da':'#fffdf7'}" stroke="${tr?C.red:'#29323c'}" stroke-width="${tr?3:2}"/>`;
          if(i===0)g+=`<path d="M${x-12} ${y-20}l4 -10 4 6 4 -8 4 8 4 -6 4 10z" fill="#f3bc59" stroke="#29323c" stroke-width="1.2"/>`;
          g+=t(x,y+5,i===0?'C':`L${i}`,{size:14,weight:700,anchor:'middle',fill:tr?C.red:C.ink});
          if(i>0&&!tr)g+=`<rect x="${x-34}" y="${y+33}" width="68" height="20" rx="10" fill="${col(dec)}"/>`+t(x,y+47,dec,{size:11,weight:700,anchor:'middle',fill:'#fff'});
          if(tr)g+=t(x,y+48,'traitor',{size:11,weight:700,anchor:'middle',fill:C.red});
          g+='</g>';}
        /* evidence table */
        const tx=500,lts=Array.from({length:s.n-1},(_,i)=>i+1);g+=t(tx,30,'WHAT EACH LOYAL LIEUTENANT HEARD',{size:12,weight:700,fill:C.muted});
        if(s.rounds===0)g+=t(tx,56,'No relay rounds: each lieutenant obeys the order it received.',{size:12,fill:C.muted});
        else{const cw=Math.min(52,380/(s.n+1));g+=t(tx,58,'from C',{size:11,weight:700,fill:C.muted});lts.forEach((i,k)=>{g+=t(tx+cw*(k+1)+20,58,`via L${i}`,{size:11,weight:700,fill:C.muted,anchor:'middle'});});g+=t(tx+cw*(lts.length+1)+30,58,'majority',{size:11,weight:700,fill:C.muted,anchor:'middle'});
          res.loyal.forEach((j,r)=>{const y=82+r*28;g+=t(tx-8,y,`L${j}`,{size:12,weight:700,anchor:'end'});const cell=(x,v)=>`<rect x="${x-16}" y="${y-14}" width="32" height="20" rx="4" fill="${col(v)}" opacity=".85"/>`+t(x,y+1,short(v),{size:11,weight:700,anchor:'middle',fill:'#fff'});
            g+=cell(tx+16,res.received.get(j));lts.forEach((i,k)=>{if(i===j)g+=t(tx+cw*(k+1)+20,y,'—',{size:12,anchor:'middle',fill:C.muted});else g+=cell(tx+cw*(k+1)+20,res.relayed.get(i).get(j));});
            g+=`<rect x="${tx+cw*(lts.length+1)+10}" y="${y-15}" width="40" height="22" rx="11" fill="${col(res.decided.get(j))}" stroke="#29323c"/>`+t(tx+cw*(lts.length+1)+30,y+1,short(res.decided.get(j)),{size:12,weight:700,anchor:'middle',fill:'#fff'});});}
        const by=Math.max(250,100+res.loyal.length*28+30);
        g+=t(tx,by,res.ok?'✓ Loyal generals agree'+(s.traitors.has(0)?'':' and follow the commander'):!res.agree?'✗ Loyal generals disagree: the army splits':'✗ Loyal generals agree, but ignore a loyal commander',{size:15,weight:700,fill:res.ok?C.green:C.red});
        g+=t(tx,by+24,`${fmt(res.messages)} messages · ${f} traitor${f===1?'':'s'} · guarantee needs n > 3f and m ≥ f`,{size:12,fill:C.muted});
        if(s.check)g+=t(tx,by+48,s.check.fail?`Checked ${s.check.total} placements × strategies × orders: ${s.check.fail} fail.`:`Checked ${s.check.total} placements × strategies × orders: all succeed.`,{size:12.5,weight:700,fill:s.check.fail?C.red:C.green});
        scene.innerHTML=svg(960,500,g,'Generals, traitors and their decisions');
        status.textContent=`n = ${s.n} · m = ${s.rounds} · f = ${f}`;
        aside.innerHTML=K.asideBlock({title:res.ok?(gd?'Enough loyal generals: agreement is guaranteed.':'It worked here — but nothing guarantees it.'):'The traitors split the army.',
          text:res.ok?(gd?`With ${s.n} generals, ${f} traitor${f===1?'':'s'} and ${s.rounds} relay round${s.rounds===1?'':'s'}, every loyal general ends with the same decision, whatever the traitors say.`:`This placement and strategy happened to work, but the condition n > 3f, m ≥ f is not met. Press “Check every placement”.`):`Loyal generals saw different versions and decided differently. ${s.rounds<f?'Add relay rounds so they can compare notes.':s.n<=3*f?`Relaying cannot help: ${s.n} generals cannot outvote ${f} traitor${f===1?'':'s'} (needs more than ${3*f}).`:''}`,
          takeaway:'Agreement needs more than three loyal generals per traitor and many messages — and a known list of who the generals are. Bitcoin has no such list.',
          stats:K.readouts([['Generals',s.n],['Traitors',f,f?'bad':''],['Messages sent',fmt(res.messages),'accent'],['Guaranteed',gd?'yes':'no',gd?'good':'bad']]),
          tries:['Three generals, one traitor lieutenant: try every strategy.','Four generals, one traitor, m = 0 then m = 1.','Make the commander the traitor.','Seven generals, two traitors: how many messages does m = 2 need?']});
      }
      draw();
      this.state=()=>({n:s.n,rounds:s.rounds,traitors:[...s.traitors],result:(r=>({ok:r.ok,agree:r.agree,messages:r.messages}))(run({n:s.n,rounds:s.rounds,traitors:[...s.traitors],strategy:s.strategy,order:s.order}))});
    }});
})(typeof window!=='undefined'?window:globalThis);

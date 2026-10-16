/* Tool 11 · Lightning routing with hidden liquidity: probe, learn, retry, split. */
(function(root){
  'use strict';
  const NODES=[{id:'A',name:'Alice',x:70,y:250},{id:'C',name:'Carol',x:200,y:120},{id:'D',name:'Dave',x:200,y:385},{id:'E',name:'Erin',x:370,y:70},{id:'F',name:'Frank',x:370,y:250},{id:'G',name:'Grace',x:330,y:440},{id:'H',name:'Heidi',x:500,y:420},{id:'B',name:'Bob',x:600,y:250}];
  /* capacity in sats; fee = base + ppm × amount, charged by the forwarding node (the channel's sending side). */
  const CHANNELS=[['A','C',800000,1,100],['A','D',600000,1,100],['C','E',250000,1,400],['C','F',500000,0,1000],['D','F',200000,1,200],['D','G',350000,1,50],['E','B',300000,1,300],['F','B',150000,1,800],['G','H',400000,0,100],['H','B',250000,1,150],['E','F',200000,1,250]];
  function network(rng){return CHANNELS.map(([a,b,cap,base,ppm],i)=>({i,a,b,cap,base,ppm,bal:Math.round(rng()*cap/1000)*1000}));} // bal = a's side
  /* Sender knowledge: bounds on the a-side balance. Alice knows her own channels exactly. */
  function freshKnowledge(net,me='A'){return net.map(ch=>ch.a===me||ch.b===me?{lo:ch.bal,hi:ch.bal}:{lo:0,hi:ch.cap});}
  const sideBal=(ch,from)=>from===ch.a?ch.bal:ch.cap-ch.bal;
  const sideBounds=(ch,k,from)=>from===ch.a?[k.lo,k.hi]:[ch.cap-k.hi,ch.cap-k.lo];
  /* Uniform-liquidity model: P(balance ≥ x) given lo ≤ balance ≤ hi. */
  function pHop(ch,k,from,x){const [lo,hi]=sideBounds(ch,k,from);if(x<=lo)return 1;if(x>hi)return 0;return (hi-x+1)/(hi-lo+1);}
  const fee=(ch,x)=>Math.ceil(ch.base+x*ch.ppm/1e6);
  function paths(net,from='A',to='B'){const out=[];const walk=(node,seen,hops)=>{if(node===to){out.push(hops.slice());return;}net.forEach(ch=>{const nxt=ch.a===node?ch.b:ch.b===node?ch.a:null;if(!nxt||seen.has(nxt))return;seen.add(nxt);hops.push({ch:ch.i,from:node,to:nxt});walk(nxt,seen,hops);hops.pop();seen.delete(nxt);});};walk(from,new Set([from]),[]);return out;}
  /* Amount on each hop: the last hop carries the payment; earlier hops add the downstream forwarding fees. */
  function quote(net,know,route,amount){const amts=new Array(route.length);amts[route.length-1]=amount;for(let i=route.length-2;i>=0;i--)amts[i]=amts[i+1]+fee(net[route[i+1].ch],amts[i+1]);
    const p=route.reduce((acc,h,i)=>acc*pHop(net[h.ch],know[h.ch],h.from,amts[i]),1);return {route,amts,fees:amts[0]-amount,p};}
  function choose(net,know,amount,pref,exclude=[]){
    const qs=paths(net).map(r=>quote(net,know,r,amount)).filter(q=>q.p>0&&!exclude.some(e=>e===q.route.map(h=>h.ch).join('-')));
    if(!qs.length)return null;
    const score=q=>pref==='cheap'?q.fees-q.p*1e-6:pref==='likely'?-q.p+q.fees*1e-9:q.fees+amount*0.004*(-Math.log(q.p));
    return qs.sort((a,b)=>score(a)-score(b))[0];
  }
  /* Try a route against the hidden balances. Returns the failing hop index or -1. */
  function attempt(net,q){for(let i=0;i<q.route.length;i++){const h=q.route[i];if(sideBal(net[h.ch],h.from)<q.amts[i])return i;}return -1;}
  function learn(net,know,q,failAt){q.route.forEach((h,i)=>{if(failAt>=0&&i>failAt)return;const ch=net[h.ch],k=know[h.ch],ok=i!==failAt,x=q.amts[i];
    if(h.from===ch.a){if(ok)k.lo=Math.max(k.lo,x);else k.hi=Math.min(k.hi,x-1);}else{if(ok)k.hi=Math.min(k.hi,ch.cap-x);else k.lo=Math.max(k.lo,ch.cap-x+1);}});}
  function settle(net,know,q,sign=1){q.route.forEach((h,i)=>{const ch=net[h.ch],k=know[h.ch],x=q.amts[i],d=sign*(h.from===ch.a?-x:x);ch.bal+=d;k.lo=Math.max(0,k.lo+d);k.hi=Math.min(ch.cap,k.hi+d);});}
  /* Full payment: retry routes until success, or give up. parts > 1 splits the amount (multi-path).
     Parts that arrive hold their liquidity; Bob settles only when every part has arrived, otherwise all are released. */
  function pay(net,know,amount,{pref='balanced',parts=1,maxAttempts=12}={}){
    const log=[],held=[];let ok=true,fees=0;const each=Array.from({length:parts},(_,i)=>Math.floor(amount/parts)+(i<amount%parts?1:0));
    for(const part of each){let done=false;for(let n=0;n<maxAttempts&&!done;n++){const q=choose(net,know,part,pref);if(!q)break;const f=attempt(net,q);log.push({q,failAt:f,part});learn(net,know,q,f);if(f<0){settle(net,know,q);held.push(q);fees+=q.fees;done=true;}}if(!done){ok=false;break;}}
    if(!ok){held.reverse().forEach(q=>settle(net,know,q,-1));fees=0;}
    return {ok,log,fees,attempts:log.length,released:ok?0:held.length};
  }
  const model={NODES,CHANNELS,network,freshKnowledge,pHop,fee,paths,quote,choose,attempt,learn,settle,pay,sideBal};
  if(typeof module!=='undefined'&&module.exports){module.exports=model;return;}

  const K=root.PlaygroundKit,{t,svg,colors:C,fmt,pct,group}=K;
  const byId=Object.fromEntries(NODES.map(n=>[n.id,n]));
  const ksat=v=>v>=1e6?`${fmt(v/1e6,2)}M`:v>=1000?`${fmt(v/1000,v<10000?1:0)}k`:String(v);
  K.register({id:'ln-routing',number:'20',module:'M 5.2',moduleName:'Lightning routing',kind:'Hidden liquidity',color:C.teal,
    title:'Routing with hidden liquidity',
    description:'Alice pays Bob through other people’s channels, but cannot see how the money inside them is split. Watch payments fail, teach her the network, and try splitting the payment.',
    preview(){let g='';const pts=[[40,84],[120,40],[120,128],[200,84],[280,84]],e=[[0,1],[0,2],[1,3],[2,3],[3,4],[1,4]];e.forEach(([a,b],i)=>{g+=`<path d="M${pts[a][0]} ${pts[a][1]}L${pts[b][0]} ${pts[b][1]}" stroke="${i===2?'#ce5750':i===0||i===4?'#23877f':'#cfc8b9'}" stroke-width="${i===0||i===2?5:3.5}" stroke-linecap="round"/>`;});pts.forEach(([x,y],i)=>{g+=`<circle cx="${x}" cy="${y}" r="13" fill="${i===0||i===4?'#f8d277':'#fffdf7'}" stroke="#29323c" stroke-width="1.6"/>`;});g+=`<text x="113" y="96" font-size="22" font-weight="700" fill="#ce5750" font-family="Arial">✗</text>`;return `<svg viewBox="0 0 320 168">${g}</svg>`;},
    mount(main,{reduced}){
      const s={amount:120000,pref:'balanced',parts:1,reveal:false,seed:21};
      let net,know,last=null,anim=null,stopAnim=null,history=[],finalBals=null;
      function reset(seed){net=network(K.rng(seed));know=freshKnowledge(net);last=null;anim=null;history=[];}
      reset(s.seed);
      const specs={amount:{format:v=>`${group(v)} sats`,round:v=>Math.round(v/1000)*1000},parts:{format:v=>v===1?'1 (single path)':`${v} parts`}};
      main.innerHTML=K.page(this,{layer:'Lightning network · source routing',
        controls:K.slider({key:'amount',label:'Alice pays Bob',min:5000,max:500000,log:true,value:s.amount,format:specs.amount.format})+K.segmented({key:'pref',label:'Route choice',options:[{value:'cheap',label:'Cheapest'},{value:'balanced',label:'Balanced'},{value:'likely',label:'Most likely'}],value:s.pref})+K.slider({key:'parts',label:'Split into (multi-path)',min:1,max:4,value:s.parts,format:specs.parts.format})+
          `<div class="demo-actions"><button class="primary" id="pay">⚡ &nbsp; Pay Bob</button><button id="reveal" aria-pressed="false">👁 Reveal hidden balances</button><span class="spacer"></span><button class="quiet" id="forget">Forget what Alice learned</button><button class="quiet" id="newnet">🎲 New balances</button></div>`,
        legend:K.legendItem('#9dd3cd','Balance on the left/upper node’s side')+K.legendItem('#f3d38f','Balance on the other side')+K.legendItem('#d9c8f6','What Alice knows (possible range)')+K.legendItem(C.teal,'Route being tried','line')+K.legendItem(C.red,'Failed hop','line'),
        notes:`<ul><li><strong>Channels.</strong> Each line is a channel with a public capacity. How that capacity is split between the two ends is private, and only the side holding enough balance can forward a payment. The hidden balances are drawn uniformly at random.</li><li><strong>Source routing.</strong> Alice picks the whole route and locks HTLCs hop by hop. Each forwarding node charges base fee + proportional fee (ppm), so earlier hops carry slightly more than Bob receives. Alice knows her own channels exactly.</li><li><strong>Learning.</strong> A failure at a hop proves that hop lacked the amount (upper bound); every hop before it had enough (lower bound). Success probabilities use the uniform-liquidity model of Pickhardt and Richter: P(balance ≥ x | lo ≤ balance ≤ hi) = (hi − x + 1)/(hi − lo + 1).</li><li><strong>Route choice.</strong> “Cheapest” minimizes fees, “Most likely” maximizes the success probability, “Balanced” adds a penalty proportional to −log P to the fee (similar in spirit to LND's probability-weighted pathfinding).</li><li><strong>Multi-path payments</strong> send several smaller HTLCs that the receiver accepts only together. Smaller parts fit through more channels. Real implementations also use timeouts, channel reserves, HTLC limits and knowledge that decays over time; none are modelled.</li></ul>`});
      const scene=main.querySelector('#scene'),controls=main.querySelector('#controls'),aside=main.querySelector('#aside'),status=main.querySelector('#scene-status');
      const q=id=>controls.querySelector('#'+id);
      K.bindControls(controls,s,specs,()=>{if(!anim)draw();});
      q('reveal').onclick=()=>{s.reveal=!s.reveal;q('reveal').setAttribute('aria-pressed',String(s.reveal));draw();};
      q('forget').onclick=()=>{stop();know=freshKnowledge(net);last=null;draw();};
      q('newnet').onclick=()=>{stop();s.seed=K.newSeed();reset(s.seed);draw();};
      q('pay').onclick=()=>{stop();const before=JSON.stringify(net.map(c=>c.bal));last=pay(net,know,s.amount,{pref:s.pref,parts:s.parts});history.push({amount:s.amount,ok:last.ok,attempts:last.attempts});
        if(reduced||!last.log.length){anim=null;draw();return;}
        anim={i:0,hop:0,phase:'go'};const balsAfter=net.map(c=>c.bal);finalBals=balsAfter;const snap=JSON.parse(before);
        /* replay attempts visually from the pre-payment state */
        net.forEach((c,i)=>{c.bal=snap[i];});
        let acc=0;stopAnim=K.loop(dt=>{acc+=dt;if(acc<330)return;acc=0;const e=last.log[anim.i];const end=e.failAt>=0?e.failAt:e.q.route.length-1;
          if(anim.hop<end+1){anim.hop++;}else{if(e.failAt<0)e.q.route.forEach((h,k)=>{const ch=net[h.ch];ch.bal+=h.from===ch.a?-e.q.amts[k]:e.q.amts[k];});anim.i++;anim.hop=0;if(anim.i>=last.log.length){net.forEach((c,i)=>{c.bal=balsAfter[i];});anim=null;stopAnim=null;draw();return false;}}
          draw();});
        draw();};
      function stop(){if(stopAnim){stopAnim();stopAnim=null;}if(anim&&finalBals){net.forEach((c,i)=>{c.bal=finalBals[i];});}anim=null;}
      function draw(){
        let g='';
        const cur=anim?last.log[anim.i]:null,shownHops=anim?anim.hop:0;
        const lastAttempt=!anim&&last&&last.log.length?last.log.at(-1):null,showQ=cur||lastAttempt;
        const routeEdges=new Map();if(showQ)showQ.q.route.forEach((h,k)=>{const reached=cur?k<shownHops:true;const failed=showQ.failAt===k&&(cur?shownHops>k:true);routeEdges.set(h.ch,{k,failed,reached,from:h.from});});
        net.forEach((ch,i)=>{const A=byId[ch.a],B=byId[ch.b],dx=B.x-A.x,dy=B.y-A.y,L=Math.hypot(dx,dy),ux=dx/L,uy=dy/L,nx=-uy,ny=ux,x1=A.x+ux*26,y1=A.y+uy*26,x2=B.x-ux*26,y2=B.y-uy*26,len=L-52;
          const at=f=>[x1+ux*len*f,y1+uy*len*f];const r=routeEdges.get(i);
          if(r)g+=`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${r.failed?C.red:r.reached?C.teal:'#9dd3cd'}" stroke-width="16" stroke-linecap="round" opacity="${r.reached||r.failed?0.35:0.25}"/>`;
          g+=`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#e7e1d4" stroke-width="9" stroke-linecap="round"/>`;
          if(s.reveal){const f=ch.bal/ch.cap,[mx,my]=at(f);g+=`<line x1="${x1}" y1="${y1}" x2="${mx}" y2="${my}" stroke="#9dd3cd" stroke-width="9" stroke-linecap="round"/><line x1="${mx}" y1="${my}" x2="${x2}" y2="${y2}" stroke="#f3d38f" stroke-width="9" stroke-linecap="round"/>`;}
          const k=know[i],[kx1,ky1]=at(k.lo/ch.cap),[kx2,ky2]=at(k.hi/ch.cap);g+=`<line x1="${kx1}" y1="${ky1}" x2="${kx2}" y2="${ky2}" stroke="#b79be6" stroke-width="3" stroke-linecap="round"/>`;
          [[kx1,ky1],[kx2,ky2]].forEach(([x,y])=>{g+=`<line x1="${x+nx*7}" y1="${y+ny*7}" x2="${x-nx*7}" y2="${y-ny*7}" stroke="#8256d8" stroke-width="2"/>`;});
          const [lx,ly]=at(0.5);g+=t(lx+nx*16,ly+ny*16+4,ksat(ch.cap),{size:11,anchor:'middle',fill:C.muted,weight:600});
          if(r&&r.failed){const [fx,fy]=at(r.from===ch.a?0.3:0.7);g+=t(fx,fy+7,'✗',{size:22,weight:700,anchor:'middle',fill:C.red});}
        });
        if(cur&&shownHops>0){const h=cur.q.route[Math.min(shownHops,cur.q.route.length)-1],P=byId[h.to];g+=`<circle cx="${P.x}" cy="${P.y}" r="30" fill="none" stroke="${C.teal}" stroke-width="3"/>`;}
        NODES.forEach(n=>{const end=n.id==='A'||n.id==='B';g+=`<circle cx="${n.x}" cy="${n.y}" r="24" fill="${end?'#f8d277':'#fffdf7'}" stroke="#29323c" stroke-width="2"/>`+t(n.x,n.y+5,n.name[0],{size:16,weight:700,anchor:'middle'})+t(n.x,n.y<150?n.y-32:n.y+42,n.name,{size:12,anchor:'middle',fill:C.muted,weight:600});});
        /* success probability curve for the currently preferred route */
        const best=amt=>{const qq=choose(net,know,amt,s.pref);return qq?qq.p:0;};
        const pts=[];for(let lg=Math.log10(5000);lg<=Math.log10(500000)+1e-9;lg+=0.04){const a=10**lg;pts.push([a,best(Math.round(a))]);}
        const qNow=choose(net,know,Math.ceil(s.amount/s.parts),s.pref);
        g+=t(680,30,'Alice’s estimate of success (one route)',{size:12,weight:700,fill:C.muted});
        g+=K.plot({x:720,y:44,w:210,h:170,xr:[5000,500000],yr:[0,1],xlog:true,xticks:[5000,50000,500000],yticks:[0,0.5,1],xfmt:ksat,yfmt:v=>pct(v,0),xlabel:'amount (sats)',series:[{pts,color:C.teal,width:2.4}],vlines:[{x:s.amount,color:C.ink,width:1.4,dash:'4 3'}],dots:[{x:Math.ceil(s.amount/s.parts),y:qNow?qNow.p:0,color:C.teal,label:qNow?pct(qNow.p,0):'0%',anchor:'end'}]});
        /* attempt log */
        g+=t(680,290,'Attempts',{size:12,weight:700,fill:C.muted});
        const items=last?last.log.slice(0,anim?anim.i+1:last.log.length):[];
        items.slice(-8).forEach((e,j,arr)=>{const y=310+j*22,idx=items.length-arr.length+j,running=anim&&idx===anim.i;const label=e.q.route.map(h=>h.from).concat('B').join('→');
          g+=t(680,y,`${idx+1}.`,{size:12,fill:C.muted})+t(700,y,label,{size:12,weight:700,cls:'mono'})+t(930,y,running?'…':e.failAt<0?`✓ fee ${e.q.fees}`:`✗ at ${byId[e.q.route[e.failAt].from].name}`,{size:12,anchor:'end',weight:700,fill:running?C.muted:e.failAt<0?C.green:C.red});});
        if(!items.length)g+=t(680,312,'Press “Pay Bob”.',{size:12,fill:C.muted});
        scene.innerHTML=svg(960,490,g,'Lightning channel graph with hidden balances and payment attempts');
        const learned=know.filter((k,i)=>!(net[i].a==='A'||net[i].b==='A')&&(k.lo>0||k.hi<net[i].cap)).length;
        status.textContent=`${net.length} channels · Alice has narrowed ${learned} of ${net.length-2}`;
        q('pay').disabled=!!anim;
        const L=last;const done=L&&!anim;
        const title=!L?'Capacity is public. The split is not.':anim?'Trying a route…':L.ok?(L.attempts>1?`Paid after ${L.attempts} attempts.`:'Paid on the first try.'):'Payment failed: no route had enough liquidity.';
        const text=!L?'Alice sees every channel’s total size, but not which side holds the money. A big channel can still be empty in her direction. She must guess, try, and learn from failures.':anim?'Each hop locks an HTLC with the next node. If a node lacks balance toward the next hop, the payment fails and the error travels back to Alice.':L.ok?`Each failure told Alice something: the purple ranges shrank. ${s.parts>1?`Splitting into ${s.parts} parts let smaller HTLCs squeeze through.`:'Larger amounts fail more often.'}`:`Every route with a non-zero chance has been tried.${L.released?` The ${L.released} part${L.released>1?'s':''} that had arrived ${L.released>1?'were':'was'} released: Bob only settles a complete payment.`:''} Try a smaller amount, split the payment, or reveal the balances to see why.`;
        aside.innerHTML=K.asideBlock({title,text,takeaway:'Lightning payments are probabilistic: reliability depends on hidden liquidity, so wallets learn from failures and split large payments.',
          stats:K.readouts([['Estimated success, best route',qNow?pct(qNow.p,0):'0%','accent'],['Route fees (estimate)',qNow?`${group(qNow.fees*s.parts)} sats`:'—'],['Attempts',done?String(L.attempts):'—',done&&L.attempts>2?'bad':''],['Result',done?(L.ok?`paid · fees ${group(L.fees)}`:'failed'):'—',done?(L.ok?'good':'bad'):'']]),
          tries:['Pay 120,000 sats. Then pay it again: is the second try faster?','Press “Forget”, pay 200,000, then try again split into 3 parts.','Switch “Cheapest” vs “Most likely” and compare fees and attempts.','Reveal the hidden balances. Were Alice’s guesses reasonable?']});
      }
      draw();
      this.state=()=>({amount:s.amount,parts:s.parts,pref:s.pref,last:last?{ok:last.ok,attempts:last.attempts,fees:last.fees}:null,history:history.slice(),balances:net.map(c=>c.bal),knowledge:know.map(k=>({...k}))});
      return stop;
    }});
})(typeof window!=='undefined'?window:globalThis);

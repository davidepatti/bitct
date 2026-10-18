/* Tool · Channel abacus and breach: off-chain balance updates, revocation and the penalty timelock. */
(function(root){
  'use strict';
  const CAP=1000000,BEAD=50000;
  function channel(aliceFunds=700000){return {states:[{n:0,a:aliceFunds,b:CAP-aliceFunds}],revoked:new Set()};}
  /* A payment creates a new commitment state and revokes the previous one (its revocation secret is handed over). */
  function pay(ch,from,amount){const s=ch.states.at(-1),a=from==='A'?s.a-amount:s.a+amount,b=CAP-a;if(a<0||b<0)return false;ch.revoked.add(s.n);ch.states.push({n:s.n+1,a,b});return true;}
  /* Close the channel. closer broadcasts state k. delay = to_self_delay (blocks) on the closer's own output.
     The other party reacts after `offline` blocks, or after 1 block if a watchtower watches for them. */
  function close(ch,{k,closer,delay,offline=0,tower=false,cooperative=false}){
    const latest=ch.states.at(-1),st=ch.states.find(x=>x.n===k)||latest;
    if(cooperative)return {kind:'cooperative',a:latest.a,b:latest.b,block:1,onchain:2};
    const cheat=ch.revoked.has(st.n),react=tower?1:offline+1;
    if(cheat&&react<=delay){const all=CAP;return {kind:'penalty',a:closer==='A'?0:all,b:closer==='B'?0:all,block:react,onchain:3,cheat:true,react};}
    return {kind:cheat?'theft':'unilateral',a:st.a,b:st.b,block:delay,onchain:cheat?3:3,cheat,react,stolen:cheat?Math.max(0,(closer==='A'?st.a-latest.a:st.b-latest.b)):0};
  }
  const model={CAP,BEAD,channel,pay,close};
  if(typeof module!=='undefined'&&module.exports){module.exports=model;return;}

  const K=root.PlaygroundKit,{t,svg,colors:C,fmt,group}=K;
  const NAME={A:'Alice',B:'Bob'},COL={A:C.purple,B:C.teal},k$=v=>`${fmt(v/1000)}k`;
  K.register({id:'channel-breach',number:'19',module:'M 5.1',moduleName:'Lightning channels and payments',kind:'Channels and penalties',color:C.teal,
    title:'Channel abacus and breach',
    description:'Slide coins between Alice and Bob without touching the chain. Then let one of them broadcast an old, better state and see whether the timelock gives the victim time to punish the cheat.',
    preview(){let g='<path d="M30 70H290" stroke="#29323c" stroke-width="2.5"/>';for(let i=0;i<14;i++)g+=`<circle cx="${40+i*18+(i>8?20:0)}" cy="70" r="8" fill="${i<9?'#8256d8':'#23877f'}" stroke="#29323c" stroke-width="1.2"/>`;g+='<rect x="60" y="110" width="200" height="22" rx="11" fill="#f6d6d3" stroke="#ce5750"/><text x="160" y="126" font-size="12" text-anchor="middle" font-family="Arial" font-weight="700" fill="#a3332d">old state? penalty!</text>';return `<svg viewBox="0 0 320 168">${g}</svg>`;},
    mount(main,{reduced}){
      let ch=channel();const s={closer:'A',pick:0,delay:144,offline:0,tower:false,result:null,tick:0};let stopAnim=null;
      const specs={delay:{format:v=>`${v} blocks (≈ ${K.duration(v*10)})`,round:v=>Math.round(v)},offline:{format:v=>v?`${v} blocks (≈ ${K.duration(v*10)})`:'always online',round:v=>Math.round(v)}};
      main.innerHTML=K.page(this,{layer:'Payment channel · commitment states',
        controls:`<div class="demo-actions"><button id="ab">Alice pays Bob 50k</button><button id="ba">Bob pays Alice 50k</button><button id="ab3">Alice pays Bob 150k</button><span class="spacer"></span><button class="quiet" id="reset">↺ New channel</button></div>`+
          K.segmented({key:'closer',label:'Who closes the channel',options:[{value:'A',label:'Alice'},{value:'B',label:'Bob'}],value:s.closer})+K.slider({key:'delay',label:'Timelock on the closer’s own funds',min:6,max:2016,log:true,value:s.delay,format:specs.delay.format})+K.slider({key:'offline',label:'The other party is offline for',min:0,max:3000,step:1,value:s.offline,format:specs.offline.format})+
          `<div class="demo-actions"><button data-tog="tower" aria-pressed="false">🗼 The other party has a watchtower</button><span class="spacer"></span><button id="coop">🤝 Close cooperatively</button><button class="primary" id="bcast">📣 Broadcast the selected state</button></div>`,
        legend:K.legendItem(C.purple,'Alice’s balance','round')+K.legendItem(C.teal,'Bob’s balance','round')+K.legendItem('#e9e5da','Revoked state')+K.legendItem('#f8d277','On-chain transaction'),
        notes:`<ul><li><strong>Channel.</strong> Alice funds a 2-of-2 output with 1,000,000 sats (700k hers, 300k Bob's in this example; real channels usually start with the funder holding everything). Each payment is a new pair of commitment transactions; nothing goes on chain until the channel closes.</li><li><strong>Revocation.</strong> When a new state is agreed, each party hands over the secret that revokes their previous commitment. Broadcasting a revoked state is possible, but the closer's own output is locked by a relative timelock (to_self_delay, OP_CHECKSEQUENCEVERIFY). During that window the other party can use the revocation secret to take the closer's output as well: the penalty.</li><li><strong>Watchtowers</strong> watch the chain for revoked states on a user's behalf and broadcast the penalty transaction. The timelock is the trade-off: longer is safer for the victim, but makes honest unilateral closes wait longer.</li><li>HTLCs in flight, fees, anchor outputs, reserves and dust limits are omitted. A real penalty transaction also pays a mining fee, and must confirm within the window. Eltoo/LN-Symmetry would replace penalties with state updates; it is not deployed.</li></ul>`});
      const scene=main.querySelector('#scene'),controls=main.querySelector('#controls'),aside=main.querySelector('#aside'),status=main.querySelector('#scene-status');
      const q=id=>controls.querySelector('#'+id);
      function stop(){if(stopAnim){stopAnim();stopAnim=null;}}
      const clear=()=>{stop();s.result=null;s.tick=0;};
      K.bindControls(controls,s,specs,()=>{clear();draw();});
      q('ab').onclick=()=>{clear();pay(ch,'A',BEAD);s.pick=ch.states.at(-1).n;draw();};q('ba').onclick=()=>{clear();pay(ch,'B',BEAD);s.pick=ch.states.at(-1).n;draw();};q('ab3').onclick=()=>{clear();pay(ch,'A',3*BEAD);s.pick=ch.states.at(-1).n;draw();};
      q('reset').onclick=()=>{clear();ch=channel();s.pick=0;draw();};
      controls.querySelector('[data-tog="tower"]').onclick=e=>{s.tower=!s.tower;e.currentTarget.setAttribute('aria-pressed',String(s.tower));clear();draw();};
      const run=res=>{clear();s.result=res;if(reduced){s.tick=res.block;draw();return;}const step=Math.max(1,Math.ceil(res.block/70));stopAnim=K.loop(()=>{s.tick=Math.min(res.block,s.tick+step);draw();if(s.tick>=res.block){stopAnim=null;return false;}});};
      q('coop').onclick=()=>run(close(ch,{cooperative:true}));
      q('bcast').onclick=()=>run(close(ch,{k:s.pick,closer:s.closer,delay:s.delay,offline:s.offline,tower:s.tower}));
      scene.addEventListener('click',e=>{const el=e.target.closest('[data-state]');if(!el)return;clear();s.pick=Number(el.dataset.state);draw();});
      scene.addEventListener('keydown',e=>{const el=e.target.closest('[data-state]');if(el&&(e.key==='Enter'||e.key===' ')){e.preventDefault();clear();s.pick=Number(el.dataset.state);draw();scene.querySelector(`[data-state="${s.pick}"]`)?.focus();}});
      function draw(){
        const latest=ch.states.at(-1),picked=ch.states.find(x=>x.n===s.pick)||latest,res=s.result,done=res&&s.tick>=res.block;let g='';
        /* abacus */
        g+=t(30,30,`CHANNEL · ${group(CAP)} sats · state #${latest.n}`,{size:12,weight:700,fill:C.muted});
        const beadsA=Math.round(latest.a/BEAD),x0=110,x1=850,bw=(x1-x0)/(CAP/BEAD+4);
        g+=`<rect x="${x0-14}" y="58" width="${x1-x0+28}" height="44" rx="22" fill="#fbf8ef" stroke="#cfc8b9"/><path d="M${x0} 80H${x1}" stroke="#29323c" stroke-width="2.5"/>`;
        for(let i=0;i<CAP/BEAD;i++){const isA=i<beadsA,cx=x0+bw/2+(isA?i*bw:(i+4)*bw);g+=`<circle cx="${cx}" cy="80" r="${bw*0.42}" fill="${isA?C.purple:C.teal}" stroke="#29323c" stroke-width="1.1"/>`;}
        g+=t(x0-24,86,'Alice',{size:14,weight:700,anchor:'end',fill:C.purple})+t(x1+24,86,'Bob',{size:14,weight:700,fill:C.teal});
        g+=t(x0,134,`${group(latest.a)} sats`,{size:13,weight:700,fill:C.purple})+t(x1,134,`${group(latest.b)} sats`,{size:13,weight:700,anchor:'end',fill:C.teal});
        /* states */
        g+=t(30,184,'COMMITMENT STATES · click one to choose what gets broadcast',{size:12,weight:700,fill:C.muted});
        const shown=ch.states.slice(-6);shown.forEach((st,i)=>{const x=30+i*152,rev=ch.revoked.has(st.n),sel=st.n===s.pick;g+=`<g data-pick="1" data-state="${st.n}" tabindex="0" role="button" aria-label="State ${st.n}${rev?', revoked':', latest'}"><rect x="${x}" y="198" width="140" height="100" rx="9" fill="${rev?'#e9e5da':'#e1f2ef'}" stroke="${sel?C.red:rev?'#bdb6a6':C.teal}" stroke-width="${sel?3:1.4}"/>`+t(x+12,226,`#${st.n} ${rev?'revoked':'latest'}`,{size:11,weight:700,fill:rev?C.muted:C.teal})+t(x+12,256,`A ${k$(st.a)}`,{size:12,weight:600,fill:C.purple})+t(x+12,284,`B ${k$(st.b)}`,{size:12,weight:600,fill:C.teal})+'</g>';});
        if(ch.states.length>6)g+=t(30,326,`(${ch.states.length-6} older states hidden)`,{size:11,fill:C.muted});
        /* chain */
        const cy=370;g+=t(30,cy-14,'ON CHAIN',{size:12,weight:700,fill:C.muted});
        const blocks=[['Funding','2-of-2 output',true]];
        if(res){if(res.kind==='cooperative')blocks.push(['Close','agreed final balances',true]);else{blocks.push([`Commitment #${picked.n}`,`by ${NAME[s.closer]}${res.cheat?' (revoked!)':''}`,true]);if(res.kind==='penalty')blocks.push(['Penalty',`${NAME[s.closer==='A'?'B':'A']} takes all`,s.tick>=res.block]);else blocks.push(['Sweep',`${NAME[s.closer]}, after timelock`,s.tick>=res.block]);}}
        blocks.forEach(([a,b,on],i)=>{const x=30+i*310;g+=`<rect x="${x}" y="${cy}" width="276" height="80" rx="9" fill="${on?'#f8d277':'#fffdf7'}" stroke="${on?'#29323c':'#cfc8b9'}" stroke-dasharray="${on?'0':'5 4'}"/>`+t(x+14,cy+32,a,{size:13,weight:700})+t(x+14,cy+62,b,{size:11.5,fill:C.muted});if(i)g+=`<path d="M${x-30} ${cy+40}H${x-4}" stroke="#29323c" stroke-width="1.6" marker-end="url(#k-arrow)"/>`;});
        if(!res)g+=t(340,cy+48,'Payments so far: none of them touched the chain.',{size:13,fill:C.muted});
        /* timeline */
        if(res&&res.kind!=='cooperative'){const ty=520,W=820,maxB=Math.max(s.delay,res.react||0,10)*1.1,sx=b=>30+Math.min(1,b/maxB)*W;
          g+=`<rect x="30" y="${ty}" width="${W}" height="10" rx="5" fill="#efeadf"/><rect x="30" y="${ty}" width="${sx(s.tick)-30}" height="10" rx="5" fill="${C.ink}" opacity=".5"/>`;
          g+=`<line x1="${sx(s.delay)}" x2="${sx(s.delay)}" y1="${ty-14}" y2="${ty+24}" stroke="${C.orange}" stroke-width="2.5"/>`+t(sx(s.delay),ty-22,`timelock ends: block ${s.delay}`,{size:11,weight:700,anchor:sx(s.delay)>700?'end':sx(s.delay)<190?'start':'middle',fill:C.orange});
          if(res.react!==undefined)g+=`<line x1="${sx(res.react)}" x2="${sx(res.react)}" y1="${ty-6}" y2="${ty+30}" stroke="${s.tower?C.teal:C.purple}" stroke-width="2.5"/>`+t(sx(res.react),ty+54,s.tower?'watchtower reacts':`${NAME[s.closer==='A'?'B':'A']} comes back online`,{size:11,weight:700,anchor:sx(res.react)>700?'end':sx(res.react)<190?'start':'middle'});
          g+=t(30,ty+90,`block ${s.tick} after the broadcast`,{size:12,fill:C.muted});}
        if(done){const win=res.kind==='penalty'?(s.closer==='A'?'B':'A'):null;const msg=res.kind==='cooperative'?`Closed together in one transaction: Alice ${group(res.a)}, Bob ${group(res.b)}.`:res.kind==='penalty'?`Penalty! ${NAME[win]} takes all ${group(CAP)} sats; ${NAME[s.closer]} loses everything.`:res.kind==='theft'?(res.stolen>0?`The cheat worked: ${NAME[s.closer]} walks away with ${group(res.stolen)} sats more than the latest state.`:`An old state went through unpunished — but it paid ${NAME[s.closer]} no more than the latest one.`):`Honest close: Alice ${group(res.a)}, Bob ${group(res.b)}; ${NAME[s.closer]} waited ${s.delay} blocks.`,ry=res.kind==='cooperative'?490:650,words=msg.split(' '),ls=[''];words.forEach(w=>{if((ls.at(-1)+' '+w).trim().length>66)ls.push(w);else ls[ls.length-1]=(ls.at(-1)+' '+w).trim();});ls.forEach((l,k)=>{g+=t(30,ry+k*32,l,{size:15,weight:700,fill:res.kind==='penalty'?C.green:res.kind==='theft'?C.red:C.ink});});}
        scene.innerHTML=svg(960,res&&res.kind!=='cooperative'?710:res?530:480,g,'Channel balance, commitment states and closing transactions');
        status.textContent=`${ch.states.length-1} payments · ${ch.revoked.size} revoked states`;
        const cheatPick=ch.revoked.has(picked.n),gain=s.closer==='A'?picked.a-latest.a:picked.b-latest.b;
        aside.innerHTML=K.asideBlock({title:res?(done?(res.kind==='penalty'?'Cheating cost the cheater everything.':res.kind==='theft'?'The victim was away too long.':res.kind==='cooperative'?'Two on-chain transactions in total.':'An honest unilateral close.'):'The clock is ticking…'):cheatPick?`State #${picked.n} is revoked — broadcasting it is cheating.`:'Payments slide beads, not blocks.',
          text:res?(done?(res.kind==='penalty'?`The closer broadcast a revoked state. Within the ${s.delay}-block window, the other side used the revocation secret to claim the closer's output too.`:res.kind==='theft'?`The revoked state was broadcast while its victim was offline for ${s.offline} blocks, longer than the ${s.delay}-block timelock. Without a watchtower, the penalty came too late.`:res.kind==='cooperative'?'Opening and closing are the only on-chain steps. Every payment in between was an exchange of signed, unpublished commitment transactions.':'The closer’s own funds wait for the timelock so the other party has time to check that this really is the latest state.'):'The broadcast commitment is on chain. The closer cannot touch their own output until the timelock expires.'):cheatPick?`It pays ${NAME[s.closer]} ${gain>0?`${group(gain)} sats more`:'no more'} than the latest state. The other party holds its revocation secret.`:`Alice and Bob update a shared balance by co-signing new commitment transactions. ${ch.states.length-1} payment${ch.states.length===2?'':'s'}, zero on-chain transactions.`,
          takeaway:'Lightning stays honest through incentives: an old state can be published, but whoever does so risks losing everything.',
          stats:K.readouts([['Payments off chain',ch.states.length-1],['On-chain transactions',res?res.onchain:1],['Selected state',`#${picked.n} ${cheatPick?'(revoked)':'(latest)'}`,cheatPick?'bad':'good'],['Outcome',done?res.kind:'—',done?(res.kind==='penalty'||res.kind==='cooperative'||res.kind==='unilateral'?'good':'bad'):'']]),
          tries:['Make a few payments from Alice to Bob, then let Alice broadcast state #0.','Keep Bob online: who ends up with the funds?','Take Bob offline for 300 blocks with a 144-block timelock. Then give him a watchtower.','Close cooperatively: how many transactions hit the chain?']});
      }
      draw();
      this.state=()=>({states:ch.states.length,latest:ch.states.at(-1),pick:s.pick,closer:s.closer,result:s.result&&s.tick>=s.result.block?s.result.kind:null});
      return stop;
    }});
})(typeof window!=='undefined'?window:globalThis);

/* Tool · Soft vs. hard fork: rule changes, miner support, and who follows which chain. */
(function(root){
  'use strict';
  /* Old and upgraded miners each extend the most-work chain that is valid under their own rules.
     Soft fork: upgraded rules forbid something old miners still do (prob freq per old block).
     Hard fork: upgraded miners use something old rules forbid (prob freq per upgraded block). */
  function simulate({type,u,freq,blocks=60,rng}){
    const all=[{id:0,parent:-1,height:0,miner:'G',flag:false,validOld:true,validNew:true}];
    const tip=rule=>{let best=all[0];for(const b of all){if(!(rule==='old'?b.validOld:b.validNew))continue;if(b.height>best.height)best=b;}return best;};
    for(let i=1;i<=blocks;i++){
      const miner=rng()<u?'U':'O',parent=tip(miner==='U'?'new':'old');
      const flag=type==='soft'?(miner==='O'&&rng()<freq):(miner==='U'&&rng()<freq);
      const ownOld=type==='soft'?true:!flag,ownNew=type==='soft'?!flag:true;
      all.push({id:i,parent:parent.id,height:parent.height+1,miner,flag,validOld:parent.validOld&&ownOld,validNew:parent.validNew&&ownNew});
    }
    const chain=b=>{const s=new Set();for(let x=b;x;x=x.parent>=0?all[x.parent]:null)s.add(x.id);return s;};
    const oldTip=tip('old'),newTip=tip('new'),oldChain=chain(oldTip),newChain=chain(newTip);
    const orphaned=all.filter(b=>b.id&&!oldChain.has(b.id)&&!newChain.has(b.id));
    /* A split is persistent once one side has built 6+ blocks since the last common ancestor. */
    let fork=0;for(const id of oldChain)if(newChain.has(id))fork=Math.max(fork,all[id].height);
    const split=oldTip.id!==newTip.id&&Math.max(oldTip.height,newTip.height)-fork>=6;
    return {blocks:all,oldTip,newTip,oldChain,newChain,split,diverged:oldTip.id!==newTip.id,forkHeight:fork,orphanedOld:orphaned.filter(b=>b.miner==='O').length,orphanedNew:orphaned.filter(b=>b.miner==='U').length,
      flagged:all.filter(b=>b.flag).length};
  }
  function splitRate({type,u,freq,blocks=60,runs=200,rng}){let s=0;for(let i=0;i<runs;i++)if(simulate({type,u,freq,blocks,rng}).split)s++;return s/runs;}
  const model={simulate,splitRate};
  if(typeof module!=='undefined'&&module.exports){module.exports=model;return;}

  const K=root.PlaygroundKit,{t,svg,colors:C,pct}=K;
  K.register({id:'soft-hard-fork',number:'15',module:'M 2.3',moduleName:'Consensus, attacks, forks',kind:'Rule changes',color:C.red,
    title:'Soft vs. hard fork',
    description:'Change the consensus rules and decide how many miners upgrade. Tightening rules (soft fork) and loosening them (hard fork) split the network in very different ways.',
    preview(){let g='<path d="M20 84H130" stroke="#29323c" stroke-width="1.5"/><path d="M130 84L300 44M130 84L300 124" stroke="#29323c" stroke-width="1.5"/>';for(let i=0;i<4;i++)g+=`<rect x="${20+i*28}" y="74" width="20" height="20" rx="3" fill="#e9e5da" stroke="#29323c" stroke-width="1.2"/>`;for(let i=0;i<5;i++){g+=`<rect x="${150+i*30}" y="${74-(i+1)*7.5}" width="20" height="20" rx="3" fill="#c9e7cf" stroke="#47965d" stroke-width="1.4"/>`;if(i<3)g+=`<rect x="${150+i*30}" y="${74+(i+1)*7.5}" width="20" height="20" rx="3" fill="#e9e5da" stroke="#8f897c" stroke-width="1.2"/>`;}return `<svg viewBox="0 0 320 168">${g}</svg>`;},
    mount(main){
      const s={type:'soft',u:0.8,freq:0.2,seed:12};let sim=null,rate=null;
      const specs={u:{format:v=>pct(v,0),round:v=>Math.round(v*100)/100},freq:{format:v=>pct(v,0),round:v=>Math.round(v*100)/100}};
      main.innerHTML=K.page(this,{layer:'Consensus rule change · node and miner versions',
        controls:K.segmented({key:'type',label:'The rule change',options:[{value:'soft',label:'Soft fork: tighten the rules'},{value:'hard',label:'Hard fork: loosen the rules'}],value:s.type})+K.slider({key:'u',label:'Hashrate of upgraded miners',min:0,max:1,step:0.01,value:s.u,format:specs.u.format})+K.slider({key:'freq',label:'How often the difference shows up',min:0.02,max:0.6,step:0.01,value:s.freq,format:specs.freq.format,hint:'Share of blocks that the other version would reject'})+
          `<div class="demo-actions"><button data-p="soft,0.8">Soft fork, 80% support</button><button data-p="soft,0.3">Soft fork, 30% support</button><button data-p="hard,0.8">Hard fork, 80% support</button><button data-p="hard,1">Hard fork, 100% support</button><span class="spacer"></span><button class="quiet" id="luck">🎲 New luck</button><button id="rate">Run 200 histories</button></div>`,
        legend:K.legendItem('#c9e7cf','Block by an upgraded miner')+K.legendItem('#e9e5da','Block by an old miner')+K.legendItem(C.red,'Block the other rules reject (red)')+K.legendItem(C.green,'Chain followed by upgraded nodes','line')+K.legendItem('#6b736f','Chain followed by old nodes','line'),
        notes:`<ul><li><strong>Soft fork.</strong> The new rules accept a subset of what the old rules accept (e.g. a new restriction on a script). Old nodes still accept upgraded blocks. If upgraded miners hold most of the hashrate, blocks breaking the new rule are orphaned and old nodes follow the upgraded chain anyway; old miners just lose some rewards. With minority support, old miners can build a longer chain the upgraded nodes reject: a persistent split, with upgraded nodes on the shorter chain.</li><li><strong>Hard fork.</strong> The new rules accept something the old rules reject (e.g. larger blocks). As soon as one such block appears, old nodes reject it and everything built on it. If upgraded miners hold most of the hashrate, old nodes and any remaining old miners are left on a separate chain; with 100% upgraded, old nodes see their chain simply stop. If upgraded miners are a minority, their feature blocks tend to be orphaned and upgraded nodes return to the old chain, unless they also reject old-rule blocks. A split is counted as persistent once one side has built six blocks since the last common block.</li><li><strong>Model.</strong> Blocks are found one at a time with no propagation delay; each miner extends the most-work chain valid under its own rules (equal work per block). Activation mechanisms (BIP9 signalling, speedy trial, flag days), economic nodes and user choice are not modelled — in practice the nodes that users and exchanges run decide which chain has value.</li></ul>`});
      const scene=main.querySelector('#scene'),controls=main.querySelector('#controls'),aside=main.querySelector('#aside'),status=main.querySelector('#scene-status');
      K.bindControls(controls,s,specs,()=>{sim=null;rate=null;draw();});
      controls.querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>{const [ty,u]=b.dataset.p.split(',');s.type=ty;s.u=Number(u);K.setSeg(controls,'type',ty);K.setSlider(controls,'u',s.u,specs.u);sim=null;rate=null;draw();});
      controls.querySelector('#luck').onclick=()=>{s.seed=K.newSeed();sim=null;draw();};
      controls.querySelector('#rate').onclick=()=>{rate=splitRate({type:s.type,u:s.u,freq:s.freq,rng:K.rng(s.seed+7)});draw();};
      function draw(){
        if(!sim)sim=simulate({type:s.type,u:s.u,freq:s.freq,blocks:60,rng:K.rng(s.seed)});
        let g='';const X=h=>30+h*14.6,rowY=b=>{const o=sim.oldChain.has(b.id),n=sim.newChain.has(b.id);return o&&n?190:n?110:o?270:360;};
        g+=t(20,26,'60 BLOCKS AFTER THE RULE CHANGE',{size:12,weight:700,fill:C.muted});
        g+=t(20,104,'upgraded',{size:11,weight:700,fill:C.green})+t(20,284,'old',{size:11,weight:700,fill:C.muted})+t(20,374,'orphaned',{size:11,weight:700,fill:C.muted});
        sim.blocks.forEach(b=>{if(b.id===0)return;const p=sim.blocks[b.parent],x=X(b.height),y=rowY(b),px=X(p.height)+11,py=rowY(p)+5.5;g+=`<path d="M${px} ${py}L${x} ${y+5.5}" stroke="#bdb6a6" stroke-width="1"/>`;});
        const chainLine=(set,col,dy)=>{const ids=[...set].map(i=>sim.blocks[i]).sort((a,b)=>a.height-b.height);let d='';ids.forEach((b,i)=>{d+=(i?'L':'M')+(X(b.height)+5.5)+' '+(rowY(b)+5.5+dy);});return `<path d="${d}" fill="none" stroke="${col}" stroke-width="3" opacity=".55"/>`;};
        g+=chainLine(sim.newChain,C.green,-12)+chainLine(sim.oldChain,'#6b736f',14);
        sim.blocks.forEach(b=>{const x=X(b.height),y=rowY(b);g+=`<rect x="${x}" y="${y}" width="11" height="11" rx="2" fill="${b.id===0?'#29323c':b.flag?'#f2b8b1':b.miner==='U'?'#c9e7cf':'#e9e5da'}" stroke="${b.flag?C.red:b.miner==='U'?C.green:'#8f897c'}" stroke-width="${b.flag?2.6:1.1}"/>`;});
        const verdict=!sim.split&&sim.diverged?'A short race is still open: the views differ for now, but nothing is settled.':sim.split?(sim.oldTip.height<sim.newTip.height&&s.type==='hard'&&s.u>=0.999?'Old nodes are stuck: no old miner extends their chain.':'Persistent split: old and upgraded nodes follow different chains.'):'One chain: old and upgraded nodes agree on the same tip.';
        g+=t(20,428,verdict,{size:15,weight:700,fill:sim.split?C.red:C.green});
        g+=t(20,466,`Chain tips: upgraded nodes at height ${sim.newTip.height} · old nodes at height ${sim.oldTip.height}`,{size:12,fill:C.muted})+t(20,498,`Orphaned blocks: ${sim.orphanedOld} by old miners · ${sim.orphanedNew} by upgraded miners`,{size:12,fill:C.muted});
        if(rate!==null)g+=t(20,534,`Across 200 histories, the network split ${pct(rate,0)} of the time.`,{size:13,weight:700,fill:rate>0.5?C.red:rate>0.05?C.orange:C.green});
        scene.innerHTML=svg(960,550,g,'Block tree after a consensus rule change');
        status.textContent=`${s.type==='soft'?'Soft':'Hard'} fork · ${pct(s.u,0)} upgraded hashrate · seed ${s.seed}`;
        const soft=s.type==='soft';
        const title=soft?(s.u>0.5?'Majority-enforced soft fork: old nodes come along.':'Minority soft fork: upgraded nodes are left on a shorter chain.'):(s.u>=0.999?'Hard fork with every miner: old nodes stop seeing blocks.':s.u>0.5?'Hard fork: the upgraded majority leaves old nodes behind.':'A minority hard fork mostly fizzles.');
        const text=soft?(s.u>0.5?'Blocks that break the new rule are valid to old nodes, but the upgraded majority never builds on them, so they are orphaned. Old nodes then follow the longer upgraded chain without noticing anything changed.':'Old miners keep producing blocks the upgraded nodes reject. Because they have more hashrate, their chain grows faster, and upgraded nodes stay on a minority chain of their own.'):(s.u>=0.999?'The first block using the new feature is invalid for old nodes. With no old miners left, their view of the chain stalls; they must upgrade to see new payments.':s.u>0.5?'Upgraded miners produce a block old nodes reject and keep extending it with most of the hashrate. Old nodes and old miners carry on separately: two chains — two currencies — until everyone picks a side.':'Upgraded nodes still accept old-rule blocks, so when the old majority outpaces their feature blocks they switch back. A minority split only persists if its nodes also refuse old-rule blocks, as deliberate chain splits have done.');
        aside.innerHTML=K.asideBlock({title,text,takeaway:'Soft forks are backward-compatible only if most hashrate enforces them; hard forks require everyone to upgrade.',
          stats:K.readouts([['Rule change',soft?'tighten (soft)':'loosen (hard)'],['Upgraded hashrate',pct(s.u,0),'accent'],['This history',sim.split?'split':'one chain',sim.split?'bad':'good'],['Split rate (200 runs)',rate===null?'—':pct(rate,0),rate!==null&&rate>0.05?'bad':'']]),
          tries:['Soft fork: lower support from 80% to 30%. Who ends up on the short chain?','Hard fork with 100% of miners: what do old nodes see?','Hard fork at 80%: run 200 histories. Is a split ever avoided?']});
      }
      draw();
      this.state=()=>({type:s.type,u:s.u,freq:s.freq,split:sim?sim.split:null,rate});
    }});
})(typeof window!=='undefined'?window:globalThis);

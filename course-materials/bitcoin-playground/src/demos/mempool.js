/* Tool 04 · Mempool fee market: a queue ordered by fee rate, cut into block-sized slices. */
(function(root){
  'use strict';
  const CAP=20000;            // toy block: 20,000 vB (a real block is ~1,000,000 vB)
  const MEMPOOL_LIMIT=10*CAP; // toy mempool size limit: lowest fee rates are evicted beyond it
  const AVG_SIZE=260;
  /* Group the mempool into mining units. A child whose package rate beats its parent is mined with it (CPFP). */
  function units(pool){
    const ids=new Set(pool.map(tx=>tx.id)),children=new Map(),out=[],used=new Set();
    pool.forEach(tx=>{if(tx.parent)children.set(tx.parent,tx);});
    for(const tx of pool){
      if(used.has(tx.id))continue;
      const child=children.get(tx.id);
      if(child){const pkg=(tx.fee+child.fee)/(tx.size+child.size);
        if(pkg>tx.fee/tx.size){out.push({txs:[tx,child],size:tx.size+child.size,rate:pkg});used.add(tx.id);used.add(child.id);continue;}}
      out.push({txs:[tx],size:tx.size,rate:tx.fee/tx.size,after:tx.parent&&ids.has(tx.parent)?tx.parent:undefined});used.add(tx.id);
    }
    return out.sort((a,b)=>b.rate-a.rate||(a.after?1:0)-(b.after?1:0));
  }
  /* Project the next blocks: greedy by package fee rate, skipping units that no longer fit. A child waits for its parent. */
  function project(pool,blocks=8,cap=CAP){
    let rest=units(pool);const out=[],placed=new Set();
    for(let b=0;b<blocks&&rest.length;b++){let room=cap;const take=[],keep=[];
      for(const u of rest){if((!u.after||placed.has(u.after))&&u.size<=room){take.push(u);room-=u.size;u.txs.forEach(t=>placed.add(t.id));}else keep.push(u);}
      out.push({units:take,size:cap-room,minRate:take.length?Math.min(...take.map(u=>u.rate)):0,maxRate:take.length?Math.max(...take.map(u=>u.rate)):0});rest=keep;}
    return {blocks:out,rest};
  }
  function makeTx(r,id){const rate=Math.min(400,Math.max(1,Math.exp(Math.log(6)+0.95*gaussian(r)))),size=Math.round(140+Math.min(900,-Math.log(1-r())*120));return {id,size,fee:Math.ceil(rate*size)};}
  function gaussian(r){let u=0,v=0;while(!u)u=r();while(!v)v=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
  /* Evict the lowest fee-rate units while the mempool exceeds its limit. */
  function trim(pool,limit=MEMPOOL_LIMIT){let total=pool.reduce((a,t)=>a+t.size,0);if(total<=limit)return {pool,evicted:[],minFee:0};
    const order=units(pool).reverse(),gone=new Set();let minFee=0;
    for(const u of order){if(total<=limit)break;u.txs.forEach(t=>gone.add(t.id));total-=u.size;minFee=Math.max(minFee,u.rate);}
    pool.forEach(t=>{if(t.parent&&gone.has(t.parent))gone.add(t.id);});
    return {pool:pool.filter(t=>!gone.has(t.id)),evicted:[...gone],minFee};}
  const model={CAP,MEMPOOL_LIMIT,AVG_SIZE,units,project,makeTx,trim};
  if(typeof module!=='undefined'&&module.exports){module.exports=model;return;}

  const K=root.PlaygroundKit,{t,svg,colors:C,fmt,group}=K;
  const heat=rate=>{const x=Math.min(1,Math.log(Math.max(1,rate))/Math.log(60));const h=210-x*190;return `hsl(${h} ${55+x*20}% ${78-x*22}%)`;};
  K.register({id:'mempool-market',number:'08',module:'M 2.1',moduleName:'Transactions',kind:'Fee market',color:C.blue,
    title:'The mempool fee market',
    description:'Transactions queue by fee rate and miners take the top slice every ~10 minutes. Raise demand, broadcast your payment, then rescue it with RBF or CPFP.',
    preview(){let g='';for(let i=0;i<34;i++){const r=1+(34-i)**1.45/2;g+=`<rect x="40" y="${12+i*4.2}" width="110" height="4.2" fill="${heat(r)}"/>`;}g+=`<path d="M34 54H156M34 96H156" stroke="#29323c" stroke-dasharray="4 3"/><rect x="40" y="110" width="110" height="5" fill="#8256d8"/>`;
      [0,1,2,3].forEach(i=>{g+=`<rect x="${180+i*32}" y="70" width="24" height="24" rx="3" fill="#f8d277" stroke="#29323c" stroke-width="1.4"/>`;});return `<svg viewBox="0 0 320 168">${g}</svg>`;},
    mount(main,{reduced}){
      const s={demand:1.25,myRate:4,speed:2,playing:!reduced,seed:20261015};
      let r,pool,nextId,clock,nextBlock,chain,mine,history,evictedNote,stopLoop=null;
      function reset(){r=K.rng(s.seed);pool=[];nextId=1;clock=0;chain=[];history=[];evictedNote='';mine={state:'idle'};
        const backlog=Math.round(5*CAP/AVG_SIZE);for(let i=0;i<backlog;i++)pool.push(makeTx(r,nextId++));nextBlock=K.expo(r,10);}
      reset();
      const specs={demand:{format:v=>`${Math.round(v*100)}% of block space`},myRate:{format:v=>`${fmt(v,v<10?1:0)} sat/vB`,round:v=>v<10?Math.round(v*2)/2:Math.round(v)}};
      main.innerHTML=K.page(this,{layer:'Local mempool · fee-rate queue',
        controls:K.slider({key:'demand',label:'Demand',min:0.4,max:2.5,step:0.05,value:s.demand,format:specs.demand.format,hint:'New bytes per 10 min vs. one block. Above 100% the queue grows.'})+K.slider({key:'myRate',label:'Your fee rate',min:1,max:200,log:true,value:s.myRate,format:specs.myRate.format})+
          K.segmented({key:'speed',label:'Simulation speed',options:[{value:0.5,label:'Slow'},{value:2,label:'Normal'},{value:8,label:'Fast'}],value:s.speed})+
          `<div class="demo-actions"><button class="primary" id="play"></button><button id="next-block">⏭ &nbsp; Next block</button><span class="spacer"></span><button id="broadcast">Broadcast my payment</button><button id="rbf">Bump fee (RBF)</button><button id="cpfp">Add child (CPFP)</button><button class="quiet" id="reset">↻ Reset</button></div>`,
        legend:K.legendItem(heat(1.5),'Low fee rate')+K.legendItem(heat(8),'Medium')+K.legendItem(heat(50),'High fee rate')+K.legendItem(C.purple,'Your payment')+K.legendItem('#f8d277','Mined block'),
        notes:`<ul><li><strong>Toy scale.</strong> A block here holds 20,000 vB (≈ 75 transactions) instead of ≈ 1,000,000 vB, and the mempool limit is ten toy blocks. Blocks arrive at random with a 10-minute average.</li><li><strong>Selection.</strong> The model miner sorts by fee rate and fills the block greedily. A child that raises its parent's package fee rate is mined together with the parent (ancestor-package scoring, the basis of CPFP). Real miners use more elaborate block templates.</li><li><strong>Projected blocks are a forecast</strong> of one node's mempool. Other nodes hold different mempools, new high-fee transactions jump the queue, and a miner may choose differently.</li><li><strong>RBF</strong> replaces the transaction with a conflicting version paying a higher fee; node policy requires the replacement to pay more in total and in rate. <strong>CPFP</strong> lets the receiver or the change owner spend an unconfirmed output with a high fee.</li><li>When a mempool reaches its size limit, nodes evict the lowest fee-rate packages and raise their minimum acceptance fee. Evicted transactions are not cancelled: they can be rebroadcast.</li></ul>`});
      const scene=main.querySelector('#scene'),controls=main.querySelector('#controls'),aside=main.querySelector('#aside'),status=main.querySelector('#scene-status');
      const q=id=>controls.querySelector('#'+id);
      K.bindControls(controls,s,specs,key=>{if(key==='speed')return;draw();});
      q('play').onclick=()=>{s.playing=!s.playing;run();draw();};
      q('next-block').onclick=()=>{advance(nextBlock-clock+1e-6);draw();};
      q('reset').onclick=()=>{s.seed=K.newSeed();reset();draw();};
      q('broadcast').onclick=()=>{const size=141;const tx={id:'me',size,fee:Math.ceil(s.myRate*size),mine:true};pool=pool.filter(t=>t.id!=='me'&&t.id!=='child');pool.push(tx);mine={state:'waiting',since:clock,rate:tx.fee/size,bumped:0};evictedNote='';enforce();draw();};
      q('rbf').onclick=()=>{const tx=pool.find(t=>t.id==='me');if(!tx)return;const fee=Math.ceil(s.myRate*tx.size);if(fee<=tx.fee)return;tx.fee=fee;pool=pool.filter(t=>t.id!=='child');mine.rate=fee/tx.size;mine.bumped++;mine.how='RBF';draw();};
      q('cpfp').onclick=()=>{const p=pool.find(t=>t.id==='me');if(!p||pool.some(t=>t.id==='child'))return;const size=110,fee=Math.max(Math.ceil(size*1),Math.ceil(s.myRate*(p.size+size))-p.fee);pool.push({id:'child',parent:'me',size,fee,mine:true});mine.how='CPFP';mine.bumped++;draw();};
      function enforce(){const res=trim(pool);if(res.evicted.length){pool=res.pool;if(res.evicted.includes('me')){mine={state:'evicted',at:clock};evictedNote=`Evicted: the mempool was full and your package was among the lowest fee rates (below ${fmt(res.minFee,1)} sat/vB).`;}}}
      function mineBlock(){const proj=project(pool,1),blk=proj.blocks[0]||{units:[],size:0,minRate:0},ids=new Set(blk.units.flatMap(u=>u.txs.map(t=>t.id)));
        pool=pool.filter(t=>!ids.has(t.id));chain.push({height:chain.length+1,count:ids.size,minRate:blk.minRate,size:blk.size,mine:ids.has('me'),at:clock});
        if(ids.has('me')&&mine.state==='waiting')mine={...mine,state:'confirmed',height:chain.length,wait:clock-mine.since};
        nextBlock=clock+K.expo(r,10);}
      function advance(dt){
        const target=clock+dt;
        while(clock<target){const step=Math.min(target-clock,nextBlock-clock,0.25);
          const lambda=s.demand*CAP/(10*AVG_SIZE);const n=K.poisson(r,lambda*step);for(let i=0;i<n;i++)pool.push(makeTx(r,nextId++));
          clock+=step;if(clock>=nextBlock-1e-9){mineBlock();}enforce();
          const proj=project(pool,1);history.push([clock,proj.blocks[0]&&proj.blocks[0].size>=CAP*0.9?proj.blocks[0].minRate:1]);if(history.length>400)history.shift();}
      }
      function run(){if(stopLoop){stopLoop();stopLoop=null;}if(!s.playing)return;stopLoop=K.loop(dt=>{advance(dt/1000*s.speed);draw();});}
      function myPkgRate(){const p=pool.find(x=>x.id==='me'),c=pool.find(x=>x.id==='child');if(!p)return 0;return c&&(p.fee+c.fee)/(p.size+c.size)>p.fee/p.size?(p.fee+c.fee)/(p.size+c.size):p.fee/p.size;}
      function draw(){
        const proj=project(pool,8);let g='';
        const X=150,W=220,Y=48,blockH=56,gap=10;
        g+=t(X+W/2,28,'MEMPOOL · projected blocks',{size:12,weight:700,anchor:'middle',fill:C.muted});
        let myBlock=-1;
        proj.blocks.forEach((b,i)=>{const y=Y+i*(blockH+gap);let x=X;
          g+=`<rect x="${X}" y="${y}" width="${W}" height="${blockH}" rx="4" fill="#f3efe4" stroke="#d6cfbf"/>`;
          b.units.forEach(u=>u.txs.forEach(tx=>{const w=tx.size/CAP*W;g+=`<rect x="${x.toFixed(2)}" y="${y}" width="${(w+0.3).toFixed(2)}" height="${blockH}" fill="${tx.mine?C.purple:heat(u.rate)}"/>`;if(tx.mine){g+=`<rect x="${x-1}" y="${y-3}" width="${Math.max(5,w+2)}" height="${blockH+6}" fill="${C.purple}" stroke="#29323c" stroke-width="1.5"/>`;myBlock=i;}x+=w;}));
          g+=`<rect x="${X}" y="${y}" width="${W}" height="${blockH}" rx="4" fill="none" stroke="#29323c" stroke-width="1.3"/>`;
          g+=t(X-12,y+24,i===0?'Next block':`+${i+1}`,{size:13,weight:700,anchor:'end'})+t(X-12,y+48,`${Math.round(b.size/CAP*100)}% full`,{size:11,anchor:'end',fill:C.muted});
          g+=t(X+W+12,y+24,b.size>=CAP*0.9?`≥ ${fmt(b.minRate,b.minRate<10?1:0)} sat/vB`:'any fee',{size:13,weight:700})+t(X+W+12,y+48,`up to ${fmt(b.maxRate,0)}`,{size:11,fill:C.muted});
        });
        const restSize=proj.rest.reduce((a,u)=>a+u.size,0);
        if(restSize){const y=Y+proj.blocks.length*(blockH+gap);g+=t(X+W/2,y+18,`+ ${fmt(restSize/CAP,1)} more blocks waiting`,{size:12,anchor:'middle',fill:C.muted,weight:600});if(proj.rest.some(u=>u.txs.some(tx=>tx.mine)))myBlock=99;}
        if(myBlock>=0&&myBlock<99){const y=Y+myBlock*(blockH+gap)+blockH/2;g+=`<path d="M${X+W+184} ${y}H${X+W+156}" stroke="${C.purple}" stroke-width="2.5" marker-end="url(#k-arrow)"/>`+t(X+W+190,y+8,'you',{size:14,weight:700,fill:C.purple});}
        /* chain of recent blocks */
        const cx=624;g+=t(cx,28,'RECENTLY MINED',{size:12,weight:700,fill:C.muted});
        chain.slice(-4).forEach((b,i,arr)=>{const x=cx+i*82,y=46;g+=`<rect x="${x}" y="${y}" width="72" height="88" rx="7" fill="#f8d277" stroke="${b.mine?C.purple:'#29323c'}" stroke-width="${b.mine?3.5:1.6}"/>`+t(x+36,y+27,`#${b.height}`,{size:13,weight:700,anchor:'middle'})+t(x+36,y+53,`${b.count} tx`,{size:11,anchor:'middle'})+t(x+36,y+77,`≥${fmt(b.minRate,b.minRate<10?1:0)}`,{size:11,anchor:'middle',fill:'#6b5a2e'});if(i<arr.length-1)g+=`<path d="M${x+72} ${y+44}H${x+82}" stroke="#29323c" stroke-width="1.6"/>`;});
        if(!chain.length)g+=t(cx,80,'No blocks yet. Press play',{size:13,fill:C.muted})+t(cx,108,'or “Next block”.',{size:13,fill:C.muted});
        const since=clock-(chain.length?chain.at(-1).at:0);
        g+=t(cx,172,`Since last block: ${fmt(since,1)} min`,{size:13,weight:600})+t(cx,202,'Block times are random:',{size:12,fill:C.muted})+t(cx,228,'10 minutes is only the average.',{size:12,fill:C.muted});
        /* next-block fee rate history */
        const pts=history.map(([x,y])=>[x,Math.max(1,y)]);const xr=[Math.max(0,clock-90),Math.max(30,clock)];
        g+=t(cx,276,'FEE RATE FOR THE NEXT BLOCK',{size:12,weight:700,fill:C.muted})+t(cx,302,'sat/vB · log scale',{size:11,fill:C.muted});
        g+=K.plot({x:cx+46,y:322,w:270,h:160,xr,yr:[1,300],ylog:true,yticks:[1,3,10,30,100,300],xticks:K.niceTicks(...xr,4),xfmt:v=>`${fmt(v)}′`,xlabel:'simulated minutes',series:[{pts:pts.filter(p=>p[0]>=xr[0]),color:C.blue,step:true}],hlines:mine.state==='waiting'?[{y:Math.max(1,myPkgRate()),color:C.purple,label:'your rate',anchor:'start'}]:[]});
        /* my payment card */
        const myTx=pool.find(x=>x.id==='me'),child=pool.find(x=>x.id==='child');
        let line1='Not broadcast yet',line2='Choose a fee rate, then broadcast.';
        if(mine.state==='waiting'){const pkg=child?(myTx.fee+child.fee)/(myTx.size+child.size):myTx.fee/myTx.size;line1=myBlock===99?'Waiting · beyond the projected blocks':`Waiting · projected in block ${myBlock===0?'next':'+'+(myBlock+1)}`;line2=`${fmt(myTx.fee/myTx.size,1)} sat/vB${child?` · package ${fmt(pkg,1)} sat/vB with child`:''} · ${fmt(clock-mine.since,0)} min so far`;}
        if(mine.state==='confirmed'){line1=`Confirmed in block #${mine.height}`;line2=`waited ${fmt(mine.wait,0)} simulated minutes${mine.how?` · rescued with ${mine.how}`:''}`;}
        if(mine.state==='evicted'){line1='Dropped from this mempool';line2='Fee too low for a full mempool. Broadcast again with more.';}
        g+=`<rect x="20" y="616" width="920" height="92" rx="10" fill="${mine.state==='confirmed'?'#e3f1e5':mine.state==='evicted'?'#f7e1de':'#efe8fb'}" stroke="${C.purple}" stroke-width="1.5"/>`+t(40,652,line1,{size:15,weight:700,fill:mine.state==='confirmed'?'#2f7342':mine.state==='evicted'?C.red:C.purple})+t(40,688,line2,{size:12,fill:C.ink});
        scene.innerHTML=svg(960,724,g,'Mempool projected blocks, recent blocks and fee history');
        status.textContent=`t = ${fmt(clock,1)} min · ${pool.length} tx waiting · ${chain.length} blocks`;
        q('play').innerHTML=s.playing?'Ⅱ &nbsp; Pause':'▶ &nbsp; Play';
        q('rbf').disabled=!(mine.state==='waiting'&&Math.ceil(s.myRate*141)>myTx.fee);q('cpfp').disabled=!(mine.state==='waiting'&&!child);q('broadcast').textContent=mine.state==='waiting'?'Broadcast again':'Broadcast my payment';
        const needed=proj.blocks[0]&&proj.blocks[0].size>=CAP*0.9?proj.blocks[0].minRate:1,backlog=pool.reduce((a,x)=>a+x.size,0)/CAP;
        const title=mine.state==='evicted'?'Too cheap for a crowded mempool.':mine.state==='confirmed'?'Confirmed — the bid was high enough.':mine.state==='waiting'&&myBlock>=2?'Your payment is stuck behind higher bids.':s.demand>1.05?'Demand exceeds block space.':'A queue sorted by bids, not by arrival.';
        const text=mine.state==='evicted'?evictedNote:mine.state==='waiting'&&myBlock>=2?'Every new transaction with a higher fee rate jumps ahead of yours. Raise the fee slider, then bump the fee (RBF) or attach a high-fee child (CPFP) to pull it into the next block.':s.demand>1.05?'More bytes arrive than blocks can carry, so the backlog grows and the fee rate needed for the next block climbs. Low-fee transactions may wait for hours or be evicted.':'Miners prefer the highest fee rate per vbyte. The mempool is effectively an auction for the next ~1 MvB of block space, re-run every time a block is found.';
        aside.innerHTML=K.asideBlock({title,text,takeaway:'There is no fixed price for a confirmation: you bid against everyone else waiting right now.',
          stats:K.readouts([['Next-block fee rate',`${fmt(needed,needed<10?1:0)} sat/vB`,'accent'],['Backlog',`${fmt(backlog,1)} blocks`],['Your rate',mine.state==='waiting'?`${fmt(myTx.fee/myTx.size,1)} sat/vB`:'—'],['Your status',mine.state==='idle'?'—':mine.state==='waiting'?(myBlock===99?'far back':`block ${myBlock===0?'next':'+'+(myBlock+1)}`):mine.state,mine.state==='confirmed'?'good':mine.state==='evicted'?'bad':'']]),
          tries:['Broadcast at 2 sat/vB with demand at 150%. Does it ever confirm?','While it waits, raise the fee and press “Bump fee (RBF)”.','Broadcast low again, then use “Add child (CPFP)” instead. Compare the package rate.','Lower demand to 50%: what happens to the next-block fee rate?']});
      }
      run();draw();
      this.state=()=>({demand:s.demand,clock,poolSize:pool.length,blocks:chain.length,mine:{...mine},playing:s.playing});
      return()=>{if(stopLoop)stopLoop();};
    }});
})(typeof window!=='undefined'?window:globalThis);

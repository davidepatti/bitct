/* Tool 09 · Natural forks and selfish mining. */
(function(root){
  'use strict';
  /* --- Natural forks: block interval vs propagation delay --- */
  const staleApprox=(delay,interval)=>1-Math.exp(-delay/interval);
  function forkSim({interval,delay,blocks=400,miners=8,rng}){
    const all=[{id:0,parent:-1,height:0,time:0,miner:-1}];let tme=0;
    const arrival=(b,m)=>b.miner===m||b.id===0?b.time:b.time+delay;
    const tipFor=(m,time)=>{let best=all[0],bestArr=0;for(const b of all){const a=arrival(b,m);if(a>time)continue;if(b.height>best.height||(b.height===best.height&&a<bestArr)){best=b;bestArr=a;}}return best;};
    for(let i=1;i<=blocks;i++){tme+=-Math.log(1-rng())*interval;const m=Math.floor(rng()*miners),tip=tipFor(m,tme);all.push({id:i,parent:tip.id,height:tip.height+1,time:tme,miner:m});}
    /* final main chain: highest, earliest */
    let best=all[0];for(const b of all)if(b.height>best.height||(b.height===best.height&&b.time<best.time))best=b;
    const main=new Set();for(let b=best;b;b=b.parent>=0?all[b.parent]:null)main.add(b.id);
    const stale=all.filter(b=>b.id>0&&!main.has(b.id)).length;
    return {blocks:all,main,stale,rate:stale/blocks};
  }
  /* --- Selfish mining (Eyal & Sirer 2014) --- */
  function selfishRevenue(a,g){if(a<=0)return 0;if(a>=0.5)return 1;const r=(a*(1-a)**2*(4*a+g*(1-2*a))-a**3)/(1-a*(1+(2-a)*a));return Math.max(0,Math.min(1,r));}
  const threshold=g=>(1-g)/(3-2*g);
  function selfishSim({alpha,gamma,events=20000,rng}){
    let lead=0,tie=false,selfish=0,honest=0,orphanedHonest=0;const trace=[];
    for(let i=0;i<events;i++){
      if(rng()<alpha){if(tie){selfish+=2;tie=false;lead=0;}else lead++;}
      else{
        if(tie){if(rng()<gamma){selfish+=1;honest+=1;orphanedHonest+=1;}else honest+=2;tie=false;lead=0;}
        else if(lead===0)honest+=1;
        else if(lead===1){tie=true;lead=0;}
        else if(lead===2){selfish+=2;lead=0;orphanedHonest+=1;}
        else{selfish+=1;lead--;orphanedHonest+=1;}
      }
      if(i<240)trace.push(tie?0.5:lead);
    }
    return {share:selfish/(selfish+honest),selfish,honest,orphanedHonest,trace};
  }
  const model={staleApprox,forkSim,selfishRevenue,threshold,selfishSim};
  if(typeof module!=='undefined'&&module.exports){module.exports=model;return;}

  const K=root.PlaygroundKit,{t,svg,colors:C,fmt,pct}=K;
  const dur=sec=>sec<60?`${fmt(sec,sec<10?1:0)} s`:`${fmt(sec/60,sec<600?1:0)} min`;
  K.register({id:'forks-selfish',number:'14',module:'M 2.3',moduleName:'Consensus, attacks, forks',kind:'Forks and incentives',color:C.red,
    title:'Natural forks and selfish mining',
    description:'Shrink the block interval or slow the network and watch accidental forks multiply. Then let a pool withhold blocks and see when cheating pays.',
    preview(){let g='<path d="M20 100H300" stroke="#29323c" stroke-width="1.5"/>';for(let i=0;i<9;i++)g+=`<rect x="${22+i*31}" y="88" width="22" height="22" rx="3" fill="#bfdaef" stroke="#29323c" stroke-width="1.3"/>`;[[3,0],[6,0]].forEach(([i])=>{g+=`<path d="M${22+i*31} 99L${36+i*31} 52" stroke="#a49c8c"/><rect x="${30+i*31}" y="40" width="22" height="22" rx="3" fill="#e9e5da" stroke="#8f897c" stroke-dasharray="3 2"/>`;});g+=`<path d="M40 150 C120 150 150 120 300 60" stroke="#ce5750" stroke-width="2.4" fill="none"/>`;return `<svg viewBox="0 0 320 168">${g}</svg>`;},
    mount(main){
      const s={view:'forks',interval:600,delay:6,seed:5,alpha:0.3,gamma:0.5};
      const specs={interval:{format:dur,round:v=>v<60?Math.round(v):Math.round(v/30)*30},delay:{format:dur,round:v=>v<10?Math.round(v*10)/10:Math.round(v)},alpha:{format:v=>pct(v,0),round:v=>Math.round(v*100)/100},gamma:{format:v=>pct(v,0),round:v=>Math.round(v*20)/20}};
      main.innerHTML=K.page(this,{tabs:K.tabs('view',[{value:'forks',label:'1 · Accidental forks'},{value:'selfish',label:'2 · Selfish mining'}],s.view),
        notes:`<ul><li><strong>Forks.</strong> Eight equal miners find blocks at random (exponential gaps). A newly found block reaches every other miner after a fixed propagation delay; until then they keep mining on the old tip, so two blocks at the same height can appear. Each miner extends the first-seen longest chain. When delay ÷ interval is small, the stale rate is about 1 − e^(−delay/interval), the chance that another block is found during the delay; with heavy forking that formula is only a rough guide, and the simulation shows the actual outcome. Real propagation (compact blocks, relay networks) is well under the 6 s default here; slower links or bigger blocks increase it.</li><li>Stale blocks waste work, lower the effective security of the chain and favour large, well-connected miners — one reason for Bitcoin’s conservative 10-minute interval.</li><li><strong>Selfish mining.</strong> A pool with share α keeps found blocks private and releases them strategically to orphan honest blocks. γ is the fraction of honest hashrate that builds on the selfish block during a tie. The curve is Eyal and Sirer’s closed-form relative revenue; the bars come from simulating their state machine.</li><li>Relative revenue is what matters after difficulty adjusts. Before the next retarget, the pool’s absolute income actually falls, because orphaned blocks slow the whole chain down.</li></ul>`});
      const scene=main.querySelector('#scene'),controls=main.querySelector('#controls'),aside=main.querySelector('#aside'),layer=main.querySelector('#layer'),status=main.querySelector('#scene-status');
      let fsim=null;
      function build(){
        if(s.view==='forks')controls.innerHTML=K.slider({key:'interval',label:'Average block interval',min:5,max:1200,log:true,value:s.interval,format:specs.interval.format})+K.slider({key:'delay',label:'Propagation delay',min:0.2,max:60,log:true,value:s.delay,format:specs.delay.format})+`<div class="demo-actions"><button data-p="600,6">Bitcoin-like (10 min)</button><button data-p="15,6">15-second blocks</button><button data-p="600,60">Slow network</button><span class="spacer"></span><button class="quiet" id="luck">🎲 New luck</button></div>`;
        else controls.innerHTML=K.slider({key:'alpha',label:'Selfish pool hashrate α',min:0,max:0.49,step:0.01,value:s.alpha,format:specs.alpha.format})+K.slider({key:'gamma',label:'Ties won by the selfish pool γ',min:0,max:1,step:0.05,value:s.gamma,format:specs.gamma.format,hint:'Share of honest miners that build on the selfish block in a tie'});
        K.bindControls(controls,s,specs,key=>{if(key==='interval'||key==='delay')fsim=null;draw();});
        controls.querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>{const [i,d]=b.dataset.p.split(',').map(Number);s.interval=i;s.delay=d;K.setSlider(controls,'interval',i,specs.interval);K.setSlider(controls,'delay',d,specs.delay);fsim=null;draw();});
        const luck=controls.querySelector('#luck');if(luck)luck.onclick=()=>{s.seed=K.newSeed();fsim=null;draw();};
      }
      function drawForks(){
        if(!fsim)fsim=forkSim({interval:s.interval,delay:s.delay,blocks:400,rng:K.rng(s.seed)});
        const approx=staleApprox(s.delay,s.interval);let g='';
        /* draw the last 36 heights as a tree */
        const maxH=Math.max(...fsim.blocks.map(b=>b.height)),staleH=fsim.blocks.filter(b=>b.id>0&&!fsim.main.has(b.id)).map(b=>b.height);
        let fromH=Math.max(1,maxH-35),bestCount=-1;for(let h=1;h<=Math.max(1,maxH-35);h++){const c=staleH.filter(x=>x>=h&&x<h+36).length;if(c>bestCount){bestCount=c;fromH=h;}}
        const toH=fromH+35,show=fsim.blocks.filter(b=>b.height>=fromH&&b.height<=toH);
        const X=b=>40+(b.height-fromH)*24.5,rowsAt={};
        g+=t(20,28,`HEIGHTS ${fromH}–${Math.min(toH,maxH)} OF A 400-BLOCK RUN · the stretch with the most forks`,{size:12,weight:700,fill:C.muted});
        show.sort((a,b)=>a.time-b.time).forEach(b=>{const main=fsim.main.has(b.id);const k=main?0:(rowsAt[b.height]=(rowsAt[b.height]||0)+1);const y=main?150:150-Math.min(k,3)*34;b._y=y;
          const par=fsim.blocks[b.parent];if(par&&par.height>=fromH&&par._y!==undefined)g+=`<path d="M${X(par)+18} ${par._y+9}L${X(b)} ${y+9}" stroke="${main?'#29323c':'#a49c8c'}" stroke-width="${main?1.6:1.2}"/>`;else if(!main&&par)g+=`<path d="M${X(b)-6} 159L${X(b)} ${y+9}" stroke="#a49c8c"/>`;
          g+=`<rect x="${X(b)}" y="${y}" width="18" height="18" rx="3" fill="${main?'#bfdaef':'#e9e5da'}" stroke="${main?'#29323c':'#8f897c'}" stroke-width="1.3" ${main?'':'stroke-dasharray="3 2"'}/>`;});
        g+=t(40,204,'Blue: main chain  ·  grey, dashed, above: stale blocks (valid, but abandoned)',{size:12,fill:C.muted});
        /* stale rate vs interval for this delay */
        const pts=[],ptsSim=[];for(let lg=Math.log10(5);lg<=Math.log10(1200)+1e-9;lg+=0.05){const T=10**lg;pts.push([T,staleApprox(s.delay,T)]);}
        g+=t(70,244,`Stale rate vs. block interval (delay ${dur(s.delay)})`,{size:13,weight:700,fill:C.muted});
        g+=K.plot({x:80,y:270,w:820,h:170,xr:[5,1200],yr:[0.0001,1],xlog:true,ylog:true,xticks:[5,15,60,150,600,1200],yticks:[0.0001,0.001,0.01,0.1,1],xfmt:dur,yfmt:v=>pct(v),xlabel:'average block interval',series:[{pts,color:C.red,width:2.4}],dots:(()=>{const f=Math.log(s.interval/5)/Math.log(240),mid=f>0.2&&f<0.8,an=f<=0.2?'start':'end',low=Math.min(approx,fsim.rate)<0.002,high=Math.max(approx,fsim.rate)>0.3;const py=v=>440-(Math.log10(Math.max(1e-4,v))+4)/4*170,pa=py(approx),ps=py(fsim.rate);let da=-10,ds=26;if(!mid){const top=Math.min(pa,ps),bot=Math.max(pa,ps);if(top>330){da=top-38-pa;ds=top-10-ps;}else{da=bot+26-pa;ds=bot+54-ps;}}else if(high){da=26;ds=26;}else if(low){da=-10;ds=-10;}return [{x:s.interval,y:Math.max(0.0001,approx),color:C.red,label:`approx. ${pct(approx)}`,anchor:mid?'start':an,dy:da},{x:s.interval,y:Math.max(0.0001,fsim.rate),color:C.ink,label:`simulated ${pct(fsim.rate)}`,anchor:mid?'end':an,dy:ds}];})()});
        scene.innerHTML=svg(960,512,g,'Block tree with stale branches and stale rate chart');
        layer.textContent='Block propagation · accidental forks';status.textContent=`${fsim.stale} stale of 400 blocks · seed ${s.seed}`;
        const ratio=s.delay/s.interval;
        aside.innerHTML=K.asideBlock({title:ratio<0.02?'Rare forks: the network hears about blocks fast.':ratio<0.15?'Forks become routine.':'The network cannot keep up.',text:`A fork happens when a second miner finds a block before hearing about the first. The window is the propagation delay (${dur(s.delay)}); blocks arrive every ${dur(s.interval)} on average, so a fraction of about delay ÷ interval of the work lands on stale branches.`,
          takeaway:'Short block intervals make the chain fast but wasteful, and give big, well-connected miners an edge.',
          stats:K.readouts([['Delay ÷ interval',fmt(ratio,ratio<0.01?4:3)],['Stale rate (approx.)',pct(approx),approx>0.05?'bad':''],['Stale rate (simulated)',pct(fsim.rate),fsim.rate>0.05?'bad':''],['Wasted per day',`${fmt(approx*86400/s.interval,approx*86400/s.interval<10?1:0)} blocks`]]),
          tries:['Press “15-second blocks”. How tangled does the tree get?','Keep 10-minute blocks but choose “Slow network”.','Find the interval at which ~1% of blocks go stale with a 6 s delay.']});
      }
      function drawSelfish(){
        const sim=selfishSim({alpha:s.alpha,gamma:s.gamma,rng:K.rng(99)}),R=selfishRevenue(s.alpha,s.gamma),th=threshold(s.gamma);let g='';
        const curve=gm=>{const pts=[];for(let a=0;a<=0.5001;a+=0.005)pts.push([a,selfishRevenue(a,gm)]);return pts;};
        g+=t(70,26,'Selfish pool’s share of main-chain blocks',{size:13,weight:700,fill:C.muted})+t(70,54,'faint curves: γ = 100% (upper) and γ = 0 (lower)',{size:11,fill:'#c98d87'});
        g+=K.plot({x:80,y:72,w:480,h:340,xr:[0,0.5],yr:[0,1],xticks:[0,0.1,0.2,0.3,0.4,0.5],yticks:[0,0.25,0.5,0.75,1],xfmt:v=>pct(v,0),yfmt:v=>pct(v,0),xlabel:'selfish pool hashrate α',
          series:[{pts:[[0,0],[0.5,0.5]],color:C.ink,width:1.6,dash:'6 5',label:'honest'},{pts:curve(0),color:'#e5b3ae',width:1.4},{pts:curve(1),color:'#e5b3ae',width:1.4},{pts:curve(s.gamma),color:C.red,width:3}],
          bands:[{from:th,to:0.5,color:C.red,opacity:0.07}],vlines:[{x:th,color:C.red,label:`profitable above ${pct(th,1)}`,dy:4,anchor:th>0.27?'end':'start'}],dots:[{x:s.alpha,y:R,color:C.red,label:pct(R,1),anchor:(s.alpha>0.35||(s.alpha<th&&s.alpha>0.12))?'end':'start',dy:R>0.75?28:-8},{x:s.alpha,y:sim.share,color:C.ink,r:4}]});
        /* bars */
        const bx=640;g+=t(bx,28,'Simulated 20,000 blocks',{size:13,weight:700,fill:C.muted});
        [['Hashrate',s.alpha,'#bfb8a8'],['Revenue',sim.share,C.red]].forEach(([lab,v,col],i)=>{const y=60+i*58;g+=t(bx,y,lab,{size:12,weight:600})+`<rect x="${bx}" y="${y+8}" width="270" height="22" rx="3" fill="#efeadf"/><rect x="${bx}" y="${y+8}" width="${270*v}" height="22" rx="3" fill="${col}"/>`+t(bx+278*v+6>bx+230?bx+266:bx+270*v+6,y+24,pct(v,1),{size:12,weight:700,anchor:bx+278*v+6>bx+230?'end':'start',fill:bx+278*v+6>bx+230?'#fff':C.ink});});
        g+=t(bx,200,`Honest blocks orphaned: ${fmt(sim.orphanedHonest)}`,{size:13,weight:600});
        /* lead trace */
        g+=t(bx,248,'Private lead, first 240 events',{size:12,weight:700,fill:C.muted});
        const tr=sim.trace.map((v,i)=>[i,v]),mx=Math.max(3,...sim.trace);
        g+=K.plot({x:bx+20,y:262,w:250,h:130,xr:[0,240],yr:[0,mx],xticks:[0,120,240],yticks:K.niceTicks(0,mx,3).filter(v=>v%1===0),series:[{pts:tr,color:C.red,width:1.6,step:true,area:0.15}],xlabel:'events'});
        scene.innerHTML=svg(960,480,g,'Selfish mining revenue versus hashrate');
        layer.textContent='Selfish mining · Eyal & Sirer model';status.textContent=`α = ${pct(s.alpha,0)} · γ = ${pct(s.gamma,0)}`;
        const gain=R-s.alpha;
        aside.innerHTML=K.asideBlock({title:gain>0.002?'Withholding blocks pays more than its fair share.':gain<-0.002?'Below the threshold, cheating loses money.':'Right at the break-even point.',text:gain>0.002?`With ${pct(s.alpha,0)} of the hashrate the selfish pool earns ${pct(R,1)} of the blocks, because honest miners waste work on blocks that get orphaned.`:`A selfish pool with ${pct(s.alpha,0)} of the hashrate loses races too often; it would earn more by publishing every block immediately.`,
          takeaway:'Bitcoin’s incentives are robust for small miners, but a well-connected pool above roughly a quarter to a third of the hashrate can profit from deviating.',
          stats:K.readouts([['Hashrate share α',pct(s.alpha,0)],['Revenue share',pct(R,1),gain>0.002?'bad':'good'],['Profit threshold',pct(th,1),'accent'],['Simulated revenue',pct(sim.share,1)]]),
          tries:['With γ = 0, find the smallest α that profits (≈ 33%).','Set γ = 100%: how small can the pool be?','Look at the lead trace: how often does the pool get two blocks ahead?']});
      }
      function draw(){if(s.view==='forks')drawForks();else drawSelfish();}
      main.querySelectorAll('.demo-tab').forEach(b=>b.addEventListener('click',()=>{s.view=b.dataset.value;main.querySelectorAll('.demo-tab').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));build();draw();}));
      build();draw();
      this.state=()=>({...s,stale:fsim?fsim.rate:null,revenue:selfishRevenue(s.alpha,s.gamma)});
    }});
})(typeof window!=='undefined'?window:globalThis);

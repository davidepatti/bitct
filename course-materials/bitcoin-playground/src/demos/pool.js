/* Tool 07 · Solo vs. pool: same expected income, very different variance. */
(function(root){
  'use strict';
  const BLOCKS_PER_DAY=144,REWARD=3.2; // BTC: 3.125 subsidy + an assumed ~0.075 in fees
  const expected=(share,days)=>share*BLOCKS_PER_DAY*days*REWARD;
  const pNoBlock=(share,days)=>Math.exp(-share*BLOCKS_PER_DAY*days);
  const soloSd=(share,days)=>REWARD*Math.sqrt(share*BLOCKS_PER_DAY*days);
  /* Proportional pool payout: your fraction of every pool block, minus the fee. */
  const poolSd=(share,poolShare,days,fee)=>REWARD*(1-fee)*(share/poolShare)*Math.sqrt(poolShare*BLOCKS_PER_DAY*days);
  function poissonSample(r,l){if(l>50){let u=0,v=0;while(!u)u=r();while(!v)v=r();return Math.max(0,Math.round(l+Math.sqrt(l)*Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)));}const L=Math.exp(-l);let k=0,p=1;do{k++;p*=r();}while(p>L);return k-1;}
  function trial(r,{share,poolShare,days,fee,scheme}){
    const solo=REWARD*poissonSample(r,share*BLOCKS_PER_DAY*days);
    const pool=scheme==='pps'?expected(share,days)*(1-fee):REWARD*(1-fee)*(share/poolShare)*poissonSample(r,poolShare*BLOCKS_PER_DAY*days);
    return {solo,pool};
  }
  /* One miner's cumulative income over time, sampled per block event. */
  function path(r,{share,poolShare,days,fee,scheme}){
    const solo=[[0,0]],pool=[[0,0]];let t=0,acc=0;
    while(true){t+=-Math.log(1-r())/(share*BLOCKS_PER_DAY);if(t>days)break;solo.push([t,acc]);acc+=REWARD;solo.push([t,acc]);}solo.push([days,acc]);
    if(scheme==='pps'){pool.push([days,expected(share,days)*(1-fee)]);}
    else{t=0;acc=0;const unit=REWARD*(1-fee)*share/poolShare;while(true){t+=-Math.log(1-r())/(poolShare*BLOCKS_PER_DAY);if(t>days)break;pool.push([t,acc]);acc+=unit;pool.push([t,acc]);}pool.push([days,acc]);}
    return {solo,pool};
  }
  const model={BLOCKS_PER_DAY,REWARD,expected,pNoBlock,soloSd,poolSd,trial,path,poissonSample};
  if(typeof module!=='undefined'&&module.exports){module.exports=model;return;}

  const K=root.PlaygroundKit,{t,svg,colors:C,fmt,pct}=K;
  const btc=v=>v>=100?fmt(v,0):v>=10?fmt(v,1):fmt(v,2);
  K.register({id:'mining-pool',number:'12',module:'M 2.2',moduleName:'Chaining and proof of work',kind:'Mining pools',color:C.orange,
    title:'Solo vs. pool lottery',
    description:'Mine alone and wait for a jackpot, or join a pool and get paid a little every day. Same expected income; compare the risk of not covering your bills.',
    preview(){let g='';[[30,5],[50,4],[70,3],[90,2],[110,1],[130,1],[150,1]].forEach(([x,h],i)=>{g+=`<rect x="${x}" y="${140-h*22}" width="16" height="${h*22}" fill="#db901e" opacity="${i?0.55:0.9}"/>`;});g+=`<path d="M175 140C200 140 205 40 225 40S250 140 290 140" fill="#47965d" opacity=".25" stroke="#47965d" stroke-width="2"/><path d="M20 140H300" stroke="#29323c" stroke-width="1.4"/>`;return `<svg viewBox="0 0 320 168">${g}</svg>`;},
    mount(main){
      const s={share:0.0002,days:30,poolShare:0.3,fee:0.02,scheme:'prop',cost:0.8,seed:7};
      const specs={share:{format:v=>pct(v,v<0.0001?4:v<0.01?3:1)},days:{format:v=>v<60?`${v} days`:`${fmt(v/30.4,0)} months`,round:v=>Math.round(v)},poolShare:{format:v=>pct(v,0)},fee:{format:v=>pct(v,1),round:v=>Math.round(v*1000)/1000},cost:{format:v=>pct(v,0),round:v=>Math.round(v*100)/100}};
      main.innerHTML=K.page(this,{layer:'Mining income · 400 simulated miners',
        controls:K.slider({key:'share',label:'Your hashrate share',min:0.00001,max:0.05,log:true,value:s.share,format:specs.share.format})+K.slider({key:'days',label:'Period',min:7,max:365,value:s.days,format:specs.days.format})+K.slider({key:'cost',label:'Bill for the period',hint:'Electricity and hosting, as % of expected income',min:0,max:1.2,step:0.01,value:s.cost,format:specs.cost.format})+K.slider({key:'poolShare',label:'Pool’s share of network',min:0.02,max:0.5,step:0.01,value:s.poolShare,format:specs.poolShare.format})+K.slider({key:'fee',label:'Pool fee',min:0,max:0.05,step:0.005,value:s.fee,format:specs.fee.format})+K.segmented({key:'scheme',label:'Pool payout',options:[{value:'prop',label:'Share of pool blocks'},{value:'pps',label:'Pay per share'}],value:s.scheme})+`<div class="demo-actions"><button class="quiet" id="luck">🎲 New luck</button><span class="note">Reward per block assumed 3.2 BTC (3.125 subsidy + fees)</span></div>`,
        legend:K.legendItem(C.orange,'Solo miner')+K.legendItem(C.green,'Pool member')+K.legendItem(C.red,'Bill for the period','line')+K.legendItem(C.ink,'Expected income','line'),
        notes:`<ul><li><strong>Model.</strong> Blocks arrive as a Poisson process: 144 per day on average, and each one is yours with probability equal to your hashrate share. A solo miner earns the whole reward per block found; the count over a period is Poisson-distributed.</li><li><strong>“Share of pool blocks”</strong> is a simplified proportional scheme (in the spirit of PPLNS): you receive your fraction of every block the pool finds, minus the fee. <strong>Pay per share</strong> (PPS/FPPS) pays for every valid share whether or not the pool finds blocks; the pool operator absorbs the variance, which is why such pools charge higher fees.</li><li>A pool smooths income but does not change the expected value, except for the fee. Pools concentrate block-template selection in the operator, the security trade-off discussed with LAB06 and Stratum V2.</li><li>Shares, stale work, difficulty changes and fee fluctuations are ignored. The 3.2 BTC reward is an illustrative assumption.</li></ul>`});
      const scene=main.querySelector('#scene'),controls=main.querySelector('#controls'),aside=main.querySelector('#aside'),status=main.querySelector('#scene-status');
      K.bindControls(controls,s,specs,draw);controls.querySelector('#luck').onclick=()=>{s.seed=K.newSeed();draw();};
      function hist(values,xr,bins){const h=new Array(bins).fill(0),w=(xr[1]-xr[0])/bins;values.forEach(v=>{h[Math.min(bins-1,Math.max(0,Math.floor((v-xr[0])/w)))]++;});return h;}
      function draw(){
        const r=K.rng(s.seed),N=400,trials=Array.from({length:N},()=>trial(r,s)),E=expected(s.share,s.days),bill=s.cost*E;
        const solo=trials.map(x=>x.solo),pool=trials.map(x=>x.pool),maxV=Math.max(E*2.2,...solo.slice().sort((a,b)=>a-b).slice(0,Math.floor(N*0.98)),...pool),xr=[0,maxV],bins=28;
        const hs=hist(solo,xr,bins),hp=hist(pool,xr,bins),top=Math.max(...hs,...hp);
        const lossSolo=solo.filter(v=>v<bill).length/N,lossPool=pool.filter(v=>v<bill).length/N;
        let g='';
        const panel=(y,h,label,col,loss)=>{let out=t(80,y-10,label,{size:13,weight:700,fill:col})+t(560,y-10,`${pct(loss,0)} fail to cover the bill`,{size:12,anchor:'end',weight:700,fill:loss>0.2?C.red:C.muted});
          const bw=480/bins,X=80;h.forEach((c,i)=>{const bh=c/top*120;out+=`<rect x="${X+i*bw+1}" y="${y+120-bh}" width="${bw-2}" height="${bh}" fill="${col}" opacity="${(i+0.5)*(xr[1]/bins)<bill?0.45:0.85}"/>`;});
          const sx=v=>X+v/xr[1]*480;out+=`<line x1="${X}" x2="${X+480}" y1="${y+120}" y2="${y+120}" stroke="#bdb6a6"/>`;out+=`<line x1="${sx(bill)}" x2="${sx(bill)}" y1="${y-2}" y2="${y+124}" stroke="${C.red}" stroke-width="2" stroke-dasharray="5 4"/><line x1="${sx(E)}" x2="${sx(E)}" y1="${y-2}" y2="${y+124}" stroke="${C.ink}" stroke-width="2"/>`;
          K.niceTicks(0,xr[1],5).forEach(v=>{out+=t(sx(v),y+138,btc(v),{size:11,anchor:'middle',fill:C.muted});});return out;};
        g+=panel(40,hs,'Solo: income over the period (BTC)',C.orange,lossSolo).replace('<g','<g');
        g+=panel(230,hp,'In a pool: income over the period (BTC)',C.green,lossPool);
        g+=t(80,410,'Each histogram: 400 simulated miners with identical hardware. Faded bars earned less than the bill.',{size:12,fill:C.muted});
        /* sample path */
        const pth=path(K.rng(s.seed+1),s);const pr=[0,Math.max(E*1.6,pth.solo.at(-1)[1],pth.pool.at(-1)[1])*1.05];
        g+=t(630,30,'One miner, day by day',{size:13,weight:700,fill:C.muted});
        g+=K.plot({x:660,y:44,w:270,h:330,xr:[0,s.days],yr:pr,xlabel:'days',ylabel:'cumulative BTC',xfmt:v=>fmt(v),yfmt:btc,series:[{pts:[[0,0],[s.days,E]],color:C.ink,width:1.5,dash:'5 5'},{pts:[[0,0],[s.days,bill]],color:C.red,width:1.5,dash:'4 4'},{pts:pth.pool,color:C.green,width:2.4},{pts:pth.solo,color:C.orange,width:2.6}]});
        scene.innerHTML=svg(960,430,g,'Income distributions for solo and pooled mining');
        status.textContent=`expected ${btc(E)} BTC per period · seed ${s.seed}`;
        const lam=s.share*BLOCKS_PER_DAY*s.days,firstDays=1/(s.share*BLOCKS_PER_DAY);
        const title=lam<1?'Solo, you probably find nothing at all.':lam<10?'Solo income is a lottery.':'With enough hashrate, solo variance shrinks.';
        const text=lam<1?`With ${pct(s.share,3)} of the hashrate you expect ${fmt(lam,2)} blocks in this period: ${pct(pNoBlock(s.share,s.days),0)} of solo miners earn nothing, while a lucky few earn a whole block reward.`:lam<10?`You expect ${fmt(lam,1)} blocks, but the actual count varies a lot. The pool pays the same on average (minus its fee) in many small pieces.`:`Expecting ${fmt(lam,0)} blocks per period, the solo income already concentrates around the mean. Very large miners can afford to mine solo.`;
        aside.innerHTML=K.asideBlock({title,text,takeaway:'Pools do not raise expected income. They trade a small fee for predictable cash flow.',
          stats:K.readouts([['Expected blocks (solo)',fmt(lam,lam<10?2:0)],['Expected income',`${btc(E)} BTC`],['Average wait for a block',K.duration(firstDays*1440)],['Solo: zero blocks',pct(pNoBlock(s.share,s.days),0),pNoBlock(s.share,s.days)>0.3?'bad':''],['Solo can’t pay bill',pct(lossSolo,0),lossSolo>0.2?'bad':''],['Pool can’t pay bill',pct(lossPool,0),lossPool>0.2?'bad':'good']]),
          tries:['Lower your share until most solo miners earn zero.','Raise the period to a year. Does solo mining become safer?','Switch the pool to “pay per share”: who now carries the risk?','Set a 5% fee with an 80% bill: is the pool still worth it?']});
      }
      draw();
      this.state=()=>({...s});
    }});
})(typeof window!=='undefined'?window:globalThis);

/* Tool 06 · Difficulty and halving clock: retargeting feedback and the issuance schedule. */
(function(root){
  'use strict';
  const EPOCH=2016,TARGET_MIN=10,HALVING=210000,COIN=1e8;
  /* Retarget: new difficulty = old × expected / actual timespan, limited to a factor of 4 either way. */
  function retarget(difficulty,actualMinutes,expectedMinutes=EPOCH*TARGET_MIN){const f=Math.min(4,Math.max(0.25,expectedMinutes/actualMinutes));return difficulty*f;}
  /* Simulate block times. hashrate(day) is relative; difficulty 1 matches hashrate 1 at 10 minutes. */
  function simulate({hashrate,epochs=10,rng,startDifficulty=1}){
    let D=startDifficulty,t=0;const blocks=[],eps=[];
    for(let e=0;e<epochs;e++){const start=t;
      for(let b=0;b<EPOCH;b++){const H=hashrate(t/1440),mean=TARGET_MIN*D/H,dt=-Math.log(1-rng())*mean;t+=dt;blocks.push({t,dt,D,H});}
      const span=t-start,next=retarget(D,span);eps.push({index:e,start,end:t,days:span/1440,difficulty:D,next,clamped:Math.abs(next/D-(EPOCH*TARGET_MIN/span))>1e-9});D=next;}
    return {blocks,epochs:eps};
  }
  function subsidy(height){const era=Math.floor(height/HALVING);return era>=64?0:Math.floor(50*COIN/2**era);}
  function supplyAt(height){let total=0,h=0;while(h<height){const era=Math.floor(h/HALVING),end=Math.min(height,(era+1)*HALVING),s=subsidy(h);if(s===0)break;total+=s*(end-h);h=end;}return total;}
  const MAX_SUPPLY=(()=>{let total=0;for(let era=0;era<64;era++)total+=Math.floor(50*COIN/2**era)*HALVING;return total;})();
  /* Approximate calendar: genesis → height 840,000 on 2024-04-20, then 10-minute blocks. */
  const G=Date.UTC(2009,0,3),H4=Date.UTC(2024,3,20);
  const yearOf=h=>{const ms=h<=840000?G+(H4-G)*h/840000:H4+(h-840000)*600000;return 1970+ms/(365.2425*864e5);};
  const heightOf=y=>{const ms=(y-1970)*365.2425*864e5;return ms<=H4?Math.max(0,(ms-G)/(H4-G)*840000):840000+(ms-H4)/600000;};
  const model={EPOCH,TARGET_MIN,HALVING,retarget,simulate,subsidy,supplyAt,MAX_SUPPLY,yearOf,heightOf};
  if(typeof module!=='undefined'&&module.exports){module.exports=model;return;}

  const K=root.PlaygroundKit,{t,svg,colors:C,fmt,pct}=K;
  K.register({id:'difficulty-clock',number:'11',module:'M 2.2',moduleName:'Chaining and proof of work',kind:'Difficulty and issuance',color:C.orange,
    title:'Difficulty and halving clock',
    description:'Make miners leave or flood in and watch block times drift until the next retarget pulls them back to ten minutes. Then follow the halvings toward 21 million.',
    preview(){let d='M20 90';for(let i=0;i<=28;i++){const x=20+i*10,y=i<8?90:i<14?90-28*(1-(i-8)/6)+(Math.sin(i)*3):90+Math.sin(i*1.7)*5;d+=`L${x} ${y}`;}
      let s='M20 150';[50,25,12.5,6.25,3.1,1.6].forEach((v,i)=>{s+=`H${20+i*46}V${150-v*1.6}`;});
      return `<svg viewBox="0 0 320 168"><path d="M20 90H300" stroke="#a49c8c" stroke-dasharray="5 4"/><path d="${d}" fill="none" stroke="#db901e" stroke-width="2.4"/><path d="M20 150H300" stroke="#cfc8b9"/><path d="M20 70H66V110H112V130H158V140H204V145H250V148H296" fill="none" stroke="#3177c8" stroke-width="2.4"/></svg>`;},
    mount(main){
      const s={view:'retarget',shock:-50,growth:0,seed:2021,year:2026};
      const specs={shock:{format:v=>`${v>0?'+':''}${v}%`,round:v=>Math.round(v/5)*5},growth:{format:v=>`${v}% per month`},year:{format:v=>String(Math.round(v)),round:v=>Math.round(v)}};
      main.innerHTML=K.page(this,{tabs:K.tabs('view',[{value:'retarget',label:'1 · Difficulty retarget'},{value:'issuance',label:'2 · Halvings and supply'}],s.view),
        notes:`<ul><li><strong>Retarget rule.</strong> Every 2,016 blocks each node computes new target = old target × (actual time of the period ÷ two weeks), limited to a factor of 4 in either direction. Difficulty moves inversely to the target. (Bitcoin Core measures 2,015 intervals, a known off-by-one; the effect is tiny.)</li><li><strong>Simulation.</strong> Block intervals are drawn from an exponential distribution with mean 10 min × difficulty ÷ hashrate, so finding a block is memoryless. Hashrate here is relative to the starting difficulty. Timestamp rules and real hashrate data are not modelled.</li><li><strong>Issuance.</strong> The subsidy starts at 50 BTC and halves every 210,000 blocks, using integer satoshis with a right shift. The sum is 20,999,999.9769 BTC, slightly below 21 million, and the subsidy reaches zero around 2140. Calendar dates are approximate: heights are mapped through the April 2024 halving (block 840,000) and then 10-minute blocks.</li><li>Miners also earn transaction fees, which this chart does not show; the security budget after the subsidy fades is an open debate.</li></ul>`});
      const scene=main.querySelector('#scene'),controls=main.querySelector('#controls'),aside=main.querySelector('#aside'),layer=main.querySelector('#layer'),status=main.querySelector('#scene-status');
      let sim=null;
      function build(){
        if(s.view==='retarget'){controls.innerHTML=K.slider({key:'shock',label:'Hashrate shock on day 20',min:-80,max:300,step:5,value:s.shock,format:specs.shock.format,hint:'e.g. −50%: half the miners switch off'})+K.slider({key:'growth',label:'Steady growth',min:0,max:30,value:s.growth,format:specs.growth.format})+`<div class="demo-actions"><button data-preset="-50,0">Miners leave (−50%)</button><button data-preset="200,0">Hashrate triples</button><button data-preset="0,15">Steady growth</button><button data-preset="0,0">Nothing changes</button><span class="spacer"></span><button class="quiet" id="luck">🎲 New luck</button></div>`;}
        else controls.innerHTML=K.slider({key:'year',label:'Year',min:2009,max:2145,value:s.year,format:specs.year.format});
        K.bindControls(controls,s,specs,key=>{if(key!=='year')sim=null;draw();});
        controls.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>{const [a,g]=b.dataset.preset.split(',').map(Number);s.shock=a;s.growth=g;K.setSlider(controls,'shock',a,specs.shock);K.setSlider(controls,'growth',g,specs.growth);sim=null;draw();});
        const luck=controls.querySelector('#luck');if(luck)luck.onclick=()=>{s.seed=K.newSeed();sim=null;draw();};
      }
      function drawRetarget(){
        const H=day=>(day<20?1:1+s.shock/100)*Math.pow(1+s.growth/100,day/30);
        if(!sim)sim=simulate({hashrate:H,epochs:9,rng:K.rng(s.seed)});
        const days=sim.blocks.at(-1).t/1440,xr=[0,Math.ceil(days/10)*10];
        /* daily average interval */
        const daily=[];let i=0;for(let d=0;d<days;d+=1){let n=0,sum=0;while(i<sim.blocks.length&&sim.blocks[i].t<(d+1)*1440){sum+=sim.blocks[i].dt;n++;i++;}if(n)daily.push([d+0.5,sum/n]);}
        let g='';
        const vl=sim.epochs.map(e=>({x:e.end/1440,color:'#cfc8b9',width:1,dash:'3 4'}));
        g+=K.plot({x:90,y:104,w:830,h:180,xr,yr:[0,Math.max(20,Math.ceil(Math.max(...daily.map(d=>d[1]))/5)*5)],xlabel:'',ylabel:'minutes per block',series:[{pts:daily,color:C.orange,width:2}],hlines:[{y:10,color:C.ink,label:'10-minute target',dash:'6 5'}],vlines:[...vl,{x:20,color:C.red,label:'shock',dy:-2}],xfmt:v=>`day ${v}`});
        const maxY=Math.max(...sim.blocks.map(b=>b.H),...sim.epochs.map(e=>e.next))*1.1;
        const hpts=[],dpts=[];for(let d=0;d<=days;d+=0.5)hpts.push([d,H(d)]);sim.epochs.forEach(e=>{dpts.push([e.start/1440,e.difficulty]);dpts.push([e.end/1440,e.difficulty]);});
        g+=K.plot({x:90,y:372,w:830,h:150,xr,yr:[0,Math.max(2,maxY)],ylabel:'relative',xlabel:'simulated days',yfmt:v=>fmt(v,v%1?1:0),series:[{pts:hpts,color:C.purple,width:2.4},{pts:dpts,color:C.blue,width:2.6}],vlines:vl,xfmt:v=>`${v}`});
        g+=t(96,354,'Hashrate',{size:12,weight:700,fill:C.purple})+t(96+K.tw('Hashrate',12)+28,354,'Difficulty (changes only at retargets)',{size:12,weight:700,fill:C.blue});
        {let row=0,prevEnd=-1e9;sim.epochs.forEach((e,k)=>{const x=90+((e.start+e.end)/2/1440)/xr[1]*830,lab=`${fmt(e.days,1)} d`,hw=K.tw(lab,10.5)/2;row=(x-hw<prevEnd+6&&row===0)?1:0;if(row===0)prevEnd=x+hw;g+=t(x,row?86:62,`${fmt(e.days,1)} d`,{size:10.5,anchor:'middle',fill:Math.abs(e.days-14)>1.5?C.red:C.muted,weight:600});});}
        g+=t(90,28,'Length of each 2,016-block period (target 14 days):',{size:11,fill:C.muted,weight:700});
        scene.innerHTML=svg(960,590,g,'Block interval, hashrate and difficulty over simulated days');
        layer.textContent='Difficulty adjustment · every 2,016 blocks';status.textContent=`${sim.epochs.length} retarget periods · seed ${s.seed}`;
        const shockEp=sim.epochs.find(e=>e.end/1440>20)||sim.epochs[0],after=sim.epochs[sim.epochs.indexOf(shockEp)+1],last=sim.epochs.at(-1);
        const slowest=sim.epochs.reduce((a,e)=>e.days>a.days?e:a),fastest=sim.epochs.reduce((a,e)=>e.days<a.days?e:a);
        const title=s.shock<0?'Fewer miners: blocks slow down until the next retarget.':s.shock>0?'More miners: blocks speed up, then difficulty catches up.':s.growth>0?'Growing hashrate keeps blocks a little fast.':'Same hashrate, same rhythm — with random noise.';
        const text=s.shock<0?`After the drop, the remaining miners need longer to find each block, so the current period stretches to ${fmt(shockEp.days,1)} days. Only when its 2,016 blocks are done does every node lower the difficulty, and block times return to about 10 minutes.`:s.shock>0?`Blocks arrive every ${fmt(10/(1+s.shock/100),1)} minutes on average until the period ends early (${fmt(shockEp.days,1)} days). The difficulty then rises${s.shock>=300?' — but by at most 4× per retarget':''}.`:s.growth>0?'Difficulty always reacts to the past two weeks, so with continuous growth it lags behind and periods finish a bit early.':'Even with constant hashrate, period lengths vary a little because block discovery is random.';
        aside.innerHTML=K.asideBlock({title,text,takeaway:'No one sets the block time: every node applies the same feedback rule to the timestamps in the chain.',
          stats:K.readouts([['Period with the shock',`${fmt(shockEp.days,1)} days`,Math.abs(shockEp.days-14)>1.5?'bad':''],['Next period',after?`${fmt(after.days,1)} days`:'—',after&&Math.abs(after.days-14)<=1.5?'good':''],['Difficulty change',`× ${fmt(shockEp.next/shockEp.difficulty,2)}`,'accent'],['Final difficulty',`× ${fmt(last.next,2)}`],['Slowest period',`${fmt(slowest.days,1)} d`],['Fastest period',`${fmt(fastest.days,1)} d`]]),
          tries:['Press “Miners leave”. How long does the affected period last?','Set the shock to +300%. Why does it take two retargets to settle?','Choose “Nothing changes” and press “New luck” a few times.']});
      }
      function drawIssuance(){
        const btcs=v=>String(+(v/COIN).toFixed(8)),hNow=Math.max(0,Math.round(heightOf(s.year))),era=Math.floor(hNow/HALVING),sub=subsidy(hNow),sup=supplyAt(hNow);
        let g='';const xr=[2009,2145];
        const pts=[],spts=[];for(let y=2009;y<=2145;y+=0.25){const h=Math.round(heightOf(y));pts.push([y,supplyAt(h)/COIN/1e6]);spts.push([y,subsidy(h)/COIN]);}
        g+=K.plot({x:100,y:44,w:820,h:200,xr,yr:[0,21],xticks:[2009,2020,2040,2060,2080,2100,2120,2140],yticks:[0,5,10,15,21],ylabel:'million BTC',series:[{pts,color:C.orange,width:2.8,area:0.12}],hlines:[{y:21,color:C.ink,label:'21 million cap',dash:'6 5'}],vlines:[{x:s.year,color:C.purple,width:2,dash:'0',label:String(Math.round(s.year)),anchor:s.year>2120?'end':'start'}],dots:[{x:s.year,y:sup/COIN/1e6,color:C.purple}],xfmt:v=>String(v)});
        g+=K.plot({x:100,y:334,w:820,h:150,xr,yr:[0,50],xticks:[2009,2020,2040,2060,2080,2100,2120,2140],yticks:[0,12.5,25,50],ylabel:'BTC per block',xlabel:'approximate year',series:[{pts:spts,color:C.blue,width:2.6,step:true}],vlines:[{x:s.year,color:C.purple,width:2,dash:'0'}],dots:[{x:s.year,y:sub/COIN,color:C.purple}],xfmt:v=>String(v),yfmt:v=>fmt(v,v%1?1:0)});
        g+=t(106,28,'Total supply',{size:12,weight:700,fill:C.orange})+t(106,318,'Block subsidy (halves every 210,000 blocks)',{size:12,weight:700,fill:C.blue});
        scene.innerHTML=svg(960,550,g,'Bitcoin supply and block subsidy over time');
        layer.textContent='Issuance schedule · consensus rule';status.textContent=`height ≈ ${fmt(hNow)} · era ${era}`;
        const nextH=(era+1)*HALVING;
        aside.innerHTML=K.asideBlock({title:sub>0?`${btcs(sub)} BTC per block in ${Math.round(s.year)}.`:'No more new coins.',text:sub>0?`This is halving era ${era}. Each step halves the reward, so the supply curve flattens quickly: about ${pct(sup/MAX_SUPPLY,1)} of all bitcoin exist by this year.`:'After the last halving the subsidy rounds down to zero satoshis. Miners are then paid only by transaction fees.',
          takeaway:'Supply is not decided by anyone each year: every node rejects a block that claims more than the scheduled subsidy plus fees.',
          stats:K.readouts([['Subsidy',`${btcs(sub)} BTC`,'accent'],['Supply so far',`${fmt(sup/COIN/1e6,3)} M BTC`],['Share of final supply',pct(sup/MAX_SUPPLY,2)],['Next halving',sub>0?`block ${fmt(nextH)} (~${Math.round(yearOf(nextH))})`:'—'],['Final supply',`${fmt(MAX_SUPPLY/COIN,4)} BTC`,'wide']]),
          tries:['Move to 2028, the next halving. What happens to the subsidy?','Find the year when 99% of the supply exists.','Drag to 2140: why is the cap slightly below 21 million?']});
      }
      function draw(){if(s.view==='retarget')drawRetarget();else drawIssuance();}
      main.querySelectorAll('.demo-tab').forEach(b=>b.addEventListener('click',()=>{s.view=b.dataset.value;main.querySelectorAll('.demo-tab').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));build();draw();}));
      build();draw();
      this.state=()=>({...s,epochs:sim?sim.epochs.map(e=>+e.days.toFixed(2)):[]});
    }});
})(typeof window!=='undefined'?window:globalThis);

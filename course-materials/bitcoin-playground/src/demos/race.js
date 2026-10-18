/* Tool 08 · Double-spend race: attacker hashrate share q against z confirmations. */
(function(root){
  'use strict';
  const logC=(n,k)=>{let s=0;for(let i=1;i<=k;i++)s+=Math.log(n-k+i)-Math.log(i);return s;};
  /* Whitepaper section 11: Poisson approximation, catching up (a tie) counts as success. */
  function satoshi(q,z){const p=1-q;if(q>=p)return 1;const l=z*q/p;let sum=1,poisson=Math.exp(-l);for(let k=0;k<=z;k++){if(k>0)poisson*=l/k;sum-=poisson*(1-Math.pow(q/p,z-k));}return Math.max(0,sum);}
  /* Exact (Rosenfeld 2014): the merchant accepts after z blocks; the attacker, mining privately from the same
     moment, succeeds if his chain ever catches up. Attacker blocks at acceptance follow a negative binomial. */
  function exact(q,z){const p=1-q;if(q>=p||z===0)return 1;let fail=0;for(let m=0;m<=z;m++)fail+=Math.exp(logC(m+z-1,m))*(Math.pow(p,z)*Math.pow(q,m)-Math.pow(p,m)*Math.pow(q,z));return Math.min(1,Math.max(0,1-fail));}
  /* One race, block by block. Returns the sequence of finds and the outcome. */
  function race(r,q,z,{giveUp=60,maxBlocks=4000}={}){
    let honest=0,attacker=0,accepted=z===0;const events=[];
    for(let i=0;i<maxBlocks;i++){
      if(accepted&&attacker>=honest)return {success:true,events,honest,attacker};
      if(accepted&&honest-attacker>=giveUp)return {success:false,events,honest,attacker,gaveUp:true};
      const who=r()<q?'A':'H';events.push(who);if(who==='H')honest++;else attacker++;
      if(!accepted&&honest>=z)accepted=true;
    }
    return {success:false,events,honest,attacker,gaveUp:true};
  }
  function monteCarlo(r,q,z,n){let wins=0;for(let i=0;i<n;i++)if(race(r,q,z).success)wins++;return wins/n;}
  const confirmationsFor=(q,target=0.001,max=200)=>{for(let z=0;z<=max;z++)if(exact(q,z)<target)return z;return Infinity;};
  const model={satoshi,exact,race,monteCarlo,confirmationsFor};
  if(typeof module!=='undefined'&&module.exports){module.exports=model;return;}

  const K=root.PlaygroundKit,{t,svg,colors:C,fmt,pct}=K;
  const prob=x=>x>=0.999995?'≈ 100%':x<1e-6?(x===0?'0':'< 0.0001%'):pct(x);
  K.register({id:'double-spend-race',number:'13',module:'M 2.3',moduleName:'Consensus, attacks, forks',kind:'Probabilistic settlement',color:C.red,
    title:'The double-spend race',
    description:'An attacker secretly mines a chain that pays himself instead of the merchant. Choose his hashrate and the confirmations you wait for, then race the chains.',
    preview(){let g='';for(let i=0;i<6;i++)g+=`<rect x="${30+i*42}" y="45" width="32" height="32" rx="4" fill="#bfdaef" stroke="#29323c" stroke-width="1.4"/>`;for(let i=0;i<4;i++)g+=`<rect x="${30+i*42}" y="105" width="32" height="32" rx="4" fill="#f6d6d3" stroke="#ce5750" stroke-width="1.4"/>`;g+=`<path d="M30 30H282" stroke="#47965d" stroke-width="2" stroke-dasharray="4 4"/><text x="200" y="125" font-size="20" fill="#ce5750" font-weight="700" font-family="Arial">…?</text>`;return `<svg viewBox="0 0 320 168">${g}</svg>`;},
    mount(main,{reduced}){
      const s={q:0.3,z:3,seed:42,race:null,shown:0,tally:null};
      let stopAnim=null,raceRng=K.rng(s.seed);
      const specs={q:{format:v=>pct(v,0),round:v=>Math.round(v*100)/100},z:{format:v=>`${v} block${v===1?'':'s'}`}};
      main.innerHTML=K.page(this,{layer:'Chain race · attacker vs. honest network',
        controls:K.slider({key:'q',label:'Attacker’s share of hashrate q',min:0,max:0.5,step:0.01,value:s.q,format:specs.q.format})+K.slider({key:'z',label:'Merchant waits for z confirmations',min:0,max:12,value:s.z,format:specs.z.format})+
          `<div class="demo-actions"><button class="primary" id="one">▶ &nbsp; Race once</button><button id="many">Run 1,000 races</button><span class="spacer"></span><span class="note" id="tally-note"></span></div>`,
        legend:K.legendItem('#bfdaef','Honest block')+K.legendItem('#f6d6d3','Attacker’s secret block')+K.legendItem(C.green,'Merchant accepts the payment')+K.legendItem(C.red,'Exact probability (this rule)','line')+K.legendItem(C.ink,'Whitepaper approximation','line'),
        notes:`<ul><li><strong>Rule in this tool.</strong> The payment enters honest block 1. The attacker starts mining a secret chain containing a conflicting spend at the same moment. The merchant hands over the goods after z confirmations. The attacker succeeds if his chain ever <em>catches up</em> with the honest one afterwards. As in Rosenfeld’s analysis, a tie counts as a win for the attacker (equivalently, he pre-mined one block); one more block then makes his chain the most-work chain and nodes reorganize to it. With z = 0 the merchant trusts an unconfirmed transaction, which the attacker can always try to replace.</li><li><strong>Exact formula</strong> (Rosenfeld, 2014). When the honest chain reaches z blocks, the attacker’s count m follows a negative binomial distribution, P(m) = C(m+z−1, m) pᶻ qᵐ. From a deficit of d blocks he catches up with probability (q/p)ᵈ (gambler’s ruin). Summing gives 1 − Σₘ₌₀..z C(m+z−1, m)(pᶻqᵐ − pᵐqᶻ).</li><li><strong>Whitepaper approximation.</strong> Section 11 of the Bitcoin paper approximates m with a Poisson distribution of mean z·q/p. Its numbers differ slightly from the exact ones; the lesson is the same.</li><li>The simulation stops a race when the attacker falls 60 blocks behind (the chance of recovering from there is negligible for q &lt; 0.5). At q ≥ 0.5 the attacker eventually wins with certainty.</li><li>Not modelled: propagation delays, selfish-mining strategies, the cost of the attack, and pre-mined blocks. The 2,016-block difficulty period means the attacker cannot simply lower difficulty.</li></ul>`});
      const scene=main.querySelector('#scene'),controls=main.querySelector('#controls'),aside=main.querySelector('#aside'),status=main.querySelector('#scene-status');
      K.bindControls(controls,s,specs,()=>{stop();s.race=null;s.tally=null;draw();});
      function stop(){if(stopAnim){stopAnim();stopAnim=null;}}
      controls.querySelector('#one').onclick=()=>{stop();s.race=race(raceRng,s.q,s.z,{giveUp:8});s.tally=s.tally;s.shown=reduced?s.race.events.length:0;
        if(!reduced){let acc=0;stopAnim=K.loop(dt=>{acc+=dt;if(acc<260)return;acc=0;s.shown++;draw();if(s.shown>=s.race.events.length){stopAnim=null;return false;}});}draw();};
      controls.querySelector('#many').onclick=()=>{stop();const r=K.rng(K.newSeed()),n=1000;let wins=0;for(let i=0;i<n;i++)if(race(r,s.q,s.z).success)wins++;s.tally={n,wins};draw();};
      function draw(){
        const ex=exact(s.q,s.z),sa=satoshi(s.q,s.z);let g='';
        /* lanes */
        const rc=s.race,ev=rc?rc.events.slice(0,s.shown):[],L=40,bw=42,gap=8;let h=0,a=0,accepted=s.z===0,acceptAt=null;
        const hb=[],ab=[];ev.forEach((e,i)=>{if(e==='H'){h++;hb.push(i);}else{a++;ab.push(i);}if(!accepted&&h>=s.z){accepted=true;acceptAt=h;}});
        const maxLen=Math.max(14,h,a)+1,cell=Math.min(bw+gap,(860)/maxLen);
        g+=t(20,30,'HONEST CHAIN · public',{size:12,weight:700,fill:C.blue})+t(20,154,'ATTACKER · secret chain with a conflicting spend',{size:12,weight:700,fill:C.red});
        g+=`<rect x="${L-30}" y="54" width="24" height="24" rx="3" fill="#e9e5da" stroke="#29323c"/><rect x="${L-30}" y="178" width="24" height="24" rx="3" fill="#e9e5da" stroke="#29323c"/><path d="M${L-18} 78V178" stroke="#a49c8c" stroke-dasharray="3 3"/>`;
        for(let i=0;i<h;i++){const x=L+i*cell;g+=`<rect x="${x}" y="46" width="${cell-gap}" height="40" rx="4" fill="${i===0?'#d9c8f6':'#bfdaef'}" stroke="#29323c" stroke-width="1.4"/>`;if(i===0&&cell>=48)g+=t(x+(cell-gap)/2,72,'pay',{size:10,anchor:'middle',weight:700,fill:'#5b3aa0'});}
        for(let i=0;i<a;i++){const x=L+i*cell;g+=`<rect x="${x}" y="170" width="${cell-gap}" height="40" rx="4" fill="${i===0?'#f6c3bd':'#f6d6d3'}" stroke="${C.red}" stroke-width="1.4"/>`;if(i===0&&cell>=48)g+=t(x+(cell-gap)/2,196,'self',{size:10,anchor:'middle',weight:700,fill:'#a3332d'});}
        if(s.z>0){const x=L+s.z*cell-gap/2;g+=`<path d="M${x} 40V96" stroke="${C.green}" stroke-width="2.5"/>`+t(x+6,118,accepted?'✓ merchant ships':`ships after ${s.z}`,{size:11,weight:700,fill:C.green});}
        let verdict='Press “Race once” to watch one attempt block by block.',vcol=C.muted;
        if(rc&&s.z===0){verdict='Zero confirmations: the attacker just broadcasts a conflicting transaction and races it to the miners.';vcol=C.red;}
        else if(rc&&s.shown>=rc.events.length){if(rc.success){verdict=`Attacker catches up (${a} vs ${h}): one more block and nodes switch chains — the payment is undone.`;vcol=C.red;}else{verdict=`Attacker is ${h-a} blocks behind and gives up. The payment stands.`;vcol=C.green;}}
        else if(rc)verdict=`Racing… honest ${h} · attacker ${a}`;
        {const vw=[''];verdict.split(' ').forEach(w=>{if((vw.at(-1)+' '+w).trim().length>74)vw.push(w);else vw[vw.length-1]=(vw.at(-1)+' '+w).trim();});vw.forEach((l,i)=>{g+=t(20,252+i*30,l,{size:14,weight:700,fill:vcol});});}
        /* probability curve */
        const zs=Array.from({length:13},(_,i)=>i),ptsE=zs.map(z=>[z,Math.max(1e-7,exact(s.q,z))]),ptsS=zs.map(z=>[z,Math.max(1e-7,satoshi(s.q,z))]);
        g+=t(30,318,`Chance the attacker wins, q = ${pct(s.q,0)}`,{size:13,weight:700,fill:C.muted});
        g+=K.plot({x:110,y:356,w:440,h:200,xr:[0,12],yr:[1e-6,1],ylog:true,yticks:[1e-6,1e-4,1e-2,1],yfmt:v=>v===1?'100%':v===1e-2?'1%':v===1e-4?'0.01%':'0.0001%',xticks:zs,xfmt:v=>String(v),xlabel:'confirmations z',series:[{pts:ptsS,color:C.ink,width:1.6,dash:'5 4'},{pts:ptsE,color:C.red,width:2.6}],hlines:[{y:0.001,color:C.muted,label:'0.1%',dash:'2 4'}],dots:[{x:s.z,y:Math.max(1e-7,ex),color:C.red,label:prob(ex),dy:ex>0.2?28:-10,anchor:s.z>9?'end':'start'}]});
        /* tally */
        const tx=624;g+=t(tx,330,'Monte Carlo check',{size:13,weight:700,fill:C.muted});
        if(s.tally){const f=s.tally.wins/s.tally.n,se=Math.sqrt(Math.max(f*(1-f),1/s.tally.n)/s.tally.n),W=290;
          g+=`<rect x="${tx}" y="350" width="${W}" height="30" rx="4" fill="#e9f2fa" stroke="#29323c"/><rect x="${tx}" y="350" width="${W*f}" height="30" rx="4" fill="${C.red}" opacity=".8"/>`;
          g+=`<line x1="${tx+W*ex}" x2="${tx+W*ex}" y1="342" y2="388" stroke="${C.ink}" stroke-width="2.5"/>`;
          g+=t(tx,416,`${s.tally.wins} / ${s.tally.n} won = ${pct(f)}`,{size:14,weight:700})+t(tx,446,`formula: ${prob(ex)} (black tick)`,{size:12,fill:C.muted})+t(tx,472,`±${pct(2*se)} sampling noise`,{size:12,fill:C.muted});
        }else g+=t(tx,370,'Press “Run 1,000 races”',{size:13,fill:C.muted})+t(tx,398,'to compare the simulation',{size:13,fill:C.muted})+t(tx,426,'with the formula.',{size:13,fill:C.muted});
        const need=confirmationsFor(s.q);g+=t(tx,520,'Needed for < 0.1% risk',{size:12,weight:700,fill:C.muted})+t(tx,562,s.q>=0.5?'none suffice':Number.isFinite(need)?String(need):'> 200',{size:28,weight:700,fill:s.q>=0.5?C.red:C.ink});
        scene.innerHTML=svg(960,618,g,'Honest and attacker chains, success probability and simulation tally');
        status.textContent=`p = ${pct(1-s.q,0)} honest · q = ${pct(s.q,0)} attacker`;
        controls.querySelector('#tally-note').textContent=s.tally?`last run: ${pct(s.tally.wins/s.tally.n)}`:'';
        const title=s.q>=0.5?'With a majority, the attacker always wins eventually.':ex<0.001?'Waiting longer makes the attack hopeless.':ex<0.05?'Possible, but unlikely.':'A real risk at this many confirmations.';
        const text=s.q>=0.5?'Above half the hashrate, the attacker’s chain grows faster on average. Confirmations only delay the inevitable; this is the “51% attack”.':`Each confirmation is a block the attacker must out-mine. With ${pct(s.q,0)} of the hashrate his chance falls roughly geometrically with z, so a few more blocks buy a lot of safety — unless q is large.`;
        aside.innerHTML=K.asideBlock({title,text,takeaway:'Confirmations do not make a payment final; they make reversing it exponentially unlikely for a minority attacker.',
          stats:K.readouts([['Attack succeeds (exact)',prob(ex),ex>0.01?'bad':'good'],['Whitepaper approximation',prob(sa)],['Confirmations for < 0.1%',s.q>=0.5?'none':Number.isFinite(need)?String(need):'> 200','wide accent']]),
          tries:['Set q = 10%. How many confirmations bring the risk under 0.1%?','Set q = 40% and z = 6, then run 1,000 races.','Accept a zero-confirmation payment (z = 0) with q = 30%.','Push q to 50%: what happens to every curve?']});
      }
      draw();
      this.state=()=>({q:s.q,z:s.z,exact:exact(s.q,s.z),satoshi:satoshi(s.q,s.z),tally:s.tally});
      return stop;
    }});
})(typeof window!=='undefined'?window:globalThis);

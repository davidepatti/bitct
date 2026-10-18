/* Tool 10 · Multisig risk dial: m-of-n against key loss, theft and shared disasters. */
(function(root){
  'use strict';
  /* Illustrative annual probabilities for teaching, not actuarial data. */
  const STORAGE={
    phone:{label:'Phone wallet',where:'pocket',loss:0.10,theft:0.05,icon:'📱'},
    hwhome:{label:'Hardware wallet',where:'home',loss:0.03,theft:0.005,icon:'🔐'},
    paper:{label:'Seed on paper',where:'home',loss:0.04,theft:0.01,icon:'📝'},
    office:{label:'Hardware wallet',where:'office',loss:0.03,theft:0.01,icon:'🔐'},
    bank:{label:'Seed in bank box',where:'bank',loss:0.01,theft:0.005,icon:'🏦'},
    friend:{label:'Co-signer / friend',where:'friend',loss:0.03,theft:0.02,icon:'🤝'}
  };
  const DISASTER={pocket:0,home:1,office:1,bank:0.1,friend:1}; // relative weights × disaster slider
  const over=(p,years)=>1-Math.pow(1-p,years);
  /* Exact enumeration: shared location disasters (fire, flood) destroy every key stored there. */
  function risk(keys,m,{years=1,disaster=0.01}={}){
    const locs=[...new Set(keys.map(k=>STORAGE[k].where))].filter(l=>DISASTER[l]>0);
    let lockout=0,theft=0,both=0,safe=0;
    for(let mask=0;mask<1<<locs.length;mask++){
      let pw=1;const hit=new Set();locs.forEach((l,i)=>{const p=over(Math.min(1,disaster*DISASTER[l]),years);if(mask>>i&1){pw*=p;hit.add(l);}else pw*=1-p;});
      if(pw===0)continue;
      /* distribution over (available count, compromised count) */
      let dist=new Map([['0,0',1]]);
      keys.forEach(k=>{const st=STORAGE[k],l=hit.has(st.where)?1:over(st.loss,years),c=over(st.theft,years),next=new Map();
        for(const [key,p] of dist){const [a,b]=key.split(',').map(Number);
          [[1,0,(1-l)*(1-c)],[1,1,(1-l)*c],[0,0,l*(1-c)],[0,1,l*c]].forEach(([da,db,q])=>{if(!q)return;const nk=`${a+da},${b+db}`;next.set(nk,(next.get(nk)||0)+p*q);});}
        dist=next;});
      for(const [key,p] of dist){const [a,b]=key.split(',').map(Number),lost=a<m,stolen=b>=m;if(lost&&stolen)both+=pw*p;else if(lost)lockout+=pw*p;else if(stolen)theft+=pw*p;else safe+=pw*p;}
    }
    return {lockout:lockout+both,theft:theft+both,both,safe,fail:lockout+theft+both};
  }
  function simulate(keys,m,opts,rng,worlds=100){
    const out=[];const locs=[...new Set(keys.map(k=>STORAGE[k].where))];
    for(let w=0;w<worlds;w++){const hit=new Set(locs.filter(l=>rng()<over(Math.min(1,(opts.disaster||0)*(DISASTER[l]||0)),opts.years||1)));let avail=0,comp=0;
      keys.forEach(k=>{const st=STORAGE[k];if(!(hit.has(st.where)||rng()<over(st.loss,opts.years||1)))avail++;if(rng()<over(st.theft,opts.years||1))comp++;});
      out.push(comp>=m?'stolen':avail<m?'lost':'safe');}
    return out;
  }
  const model={STORAGE,DISASTER,risk,simulate,over};
  if(typeof module!=='undefined'&&module.exports){module.exports=model;return;}

  const K=root.PlaygroundKit,{t,svg,colors:C,fmt,pct,esc}=K;
  const ORDER=['phone','hwhome','paper','office','bank','friend'];
  const PRESETS={single:{keys:['phone'],m:1,label:'One phone wallet'},backup:{keys:['hwhome','paper'],m:1,label:'Hardware + paper backup'},home:{keys:['hwhome','paper','hwhome'],m:2,label:'2-of-3, all at home'},spread:{keys:['hwhome','office','bank'],m:2,label:'2-of-3, spread out'},corp:{keys:['hwhome','office','bank','friend','paper'],m:3,label:'3-of-5'}};
  const prob=x=>x<1e-5?'< 0.001%':pct(x);
  K.register({id:'multisig-risk',number:'17',module:'M 3.1',moduleName:'Key management and security',kind:'Custody design',color:C.green,
    title:'Multisig risk dial',
    description:'Choose how many keys, where they live, and how many must sign. See the chance you lose your coins — and the chance a thief takes them — move in opposite directions.',
    preview(){let g='<rect x="125" y="50" width="70" height="70" rx="10" fill="#e3f1e5" stroke="#29323c" stroke-width="1.6"/><text x="160" y="94" font-size="20" font-weight="700" text-anchor="middle" font-family="Arial" fill="#29323c">2/3</text>';[[50,40],[260,40],[155,140]].forEach(([x,y],i)=>{g+=`<circle cx="${x}" cy="${y}" r="17" fill="${i===2?'#e9e5da':'#f8d277'}" stroke="#29323c" stroke-width="1.4"/><path d="M${x} ${y}L160 85" stroke="#a49c8c" stroke-dasharray="3 3"/>`;});return `<svg viewBox="0 0 320 168">${g}</svg>`;},
    mount(main){
      const s={keys:['hwhome','office','bank'],m:2,years:10,disaster:0.01,seed:3};
      const specs={years:{format:v=>`${v} year${v===1?'':'s'}`},disaster:{format:v=>pct(v,1)+' / year',round:v=>Math.round(v*1000)/1000}};
      main.innerHTML=K.page(this,{layer:'Custody design · m-of-n spending policy',
        controls:`<div class="ctl ctl-seg"><span class="ctl-top"><span class="ctl-label">Number of keys</span></span><div class="seg" id="nkeys">${[1,2,3,4,5].map(n=>`<button type="button" data-n="${n}">${n}</button>`).join('')}</div></div><div class="ctl ctl-seg"><span class="ctl-top"><span class="ctl-label">Signatures required (m)</span></span><div class="seg" id="mreq"></div></div>`+
          K.slider({key:'years',label:'Time horizon',min:1,max:30,value:s.years,format:specs.years.format})+K.slider({key:'disaster',label:'Fire or flood at a place',min:0,max:0.05,step:0.001,value:s.disaster,format:specs.disaster.format,hint:'Destroys every key kept there'})+
          `<div class="demo-actions">${Object.entries(PRESETS).map(([k,p])=>`<button data-preset="${k}">${p.label}</button>`).join('')}<span class="spacer"></span><button class="quiet" id="luck">🎲 Re-roll worlds</button></div>`,
        legend:K.legendItem(C.green,'Safe','round')+K.legendItem('#a49c8c','Locked out (too few keys left)','round')+K.legendItem(C.red,'Stolen (thief has m keys)','round'),
        notes:`<ul><li><strong>Model.</strong> Each key can independently be lost (destroyed, forgotten, device failure) or compromised (copied by an attacker), with the illustrative annual probabilities shown on its card. A disaster at a place destroys every key stored there, which makes losses correlated. Probabilities are compounded over the time horizon and computed exactly by enumeration.</li><li><strong>Outcomes.</strong> You are locked out if fewer than m keys remain usable. A thief can spend if he obtains m keys; this assumes the compromised keys end up with one attacker, the pessimistic case.</li><li>Recovery procedures, key rotation, timelocked recovery paths (decaying multisig), inheritance and coercion are not modelled, and the numbers are not actuarial data. The point is the shape of the trade-off.</li><li>In Bitcoin the m-of-n policy is enforced by the output’s script (or by a Taproot/MuSig2/FROST construction), so every node checks it; descriptors and PSBTs coordinate the signers.</li></ul>`});
      const scene=main.querySelector('#scene'),controls=main.querySelector('#controls'),aside=main.querySelector('#aside'),status=main.querySelector('#scene-status');
      K.bindControls(controls,s,specs,draw);
      function segs(){controls.querySelectorAll('[data-n]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.n)===s.keys.length)));
        const mr=controls.querySelector('#mreq');mr.innerHTML=Array.from({length:s.keys.length},(_,i)=>`<button type="button" data-m="${i+1}" aria-pressed="${i+1===s.m}">${i+1}</button>`).join('');
        mr.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{s.m=Number(b.dataset.m);segs();draw();});}
      controls.querySelectorAll('[data-n]').forEach(b=>b.onclick=()=>{const n=Number(b.dataset.n);while(s.keys.length<n)s.keys.push(ORDER[(s.keys.length+1)%ORDER.length]);s.keys=s.keys.slice(0,n);s.m=Math.min(s.m,n);segs();draw();});
      controls.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>{const p=PRESETS[b.dataset.preset];s.keys=p.keys.slice();s.m=p.m;segs();draw();});
      controls.querySelector('#luck').onclick=()=>{s.seed=K.newSeed();draw();};
      const cycle=i=>{s.keys[i]=ORDER[(ORDER.indexOf(s.keys[i])+1)%ORDER.length];draw();scene.querySelector(`[data-key-card="${i}"]`)?.focus();};
      scene.addEventListener('click',e=>{const el=e.target.closest('[data-key-card]');if(el)cycle(Number(el.dataset.keyCard));});
      scene.addEventListener('keydown',e=>{const el=e.target.closest('[data-key-card]');if(el&&(e.key==='Enter'||e.key===' ')){e.preventDefault();cycle(Number(el.dataset.keyCard));}});
      function draw(){
        const opts={years:s.years,disaster:s.disaster},R=risk(s.keys,s.m,opts),n=s.keys.length;let g='';
        /* key cards (left) and vault */
        const cardH=88,step=98,ky0=40,listH=(n-1)*step+cardH,vx=470,vy=ky0+listH/2;
        g+=`<rect x="${vx-70}" y="${vy-60}" width="140" height="120" rx="14" fill="#e3f1e5" stroke="#29323c" stroke-width="2"/>`+t(vx,vy+2,`${s.m} of ${n}`,{size:28,weight:700,anchor:'middle'})+t(vx,vy+30,'signatures',{size:11,anchor:'middle',fill:C.muted})+t(vx,vy+50,'to spend',{size:11,anchor:'middle',fill:C.muted});
        s.keys.forEach((k,i)=>{const y=ky0+i*step,st=STORAGE[k];
          g+=`<path d="M340 ${y+cardH/2}L${vx-72} ${vy+(i-(n-1)/2)*14}" stroke="#a49c8c" stroke-width="1.5" stroke-dasharray="4 4"/>`;
          g+=`<g data-pick="1" data-key-card="${i}" tabindex="0" role="button" aria-label="Key ${i+1}: ${esc(st.label)} at ${st.where}. Activate to change storage."><rect x="20" y="${y}" width="320" height="${cardH}" rx="10" fill="#fffdf7" stroke="#29323c" stroke-width="1.5"/>`;
          g+=t(36,y+30,`${st.icon} ${st.label}`,{size:12.5,weight:700})+t(36,y+56,`kept: ${st.where}`,{size:11,fill:C.muted})+t(36,y+78,`lose ${pct(st.loss,1)} · theft ${pct(st.theft,1)} /yr`,{size:10.5,fill:C.muted})+`</g>`;});
        g+=t(20,ky0+listH+40,'Click a key to change where and how it is stored.',{size:12,fill:C.muted,weight:600});
        /* worlds grid */
        const sim=simulate(s.keys,s.m,opts,K.rng(s.seed)),gx=590,gy=74;
        g+=t(gx,28,'100 possible futures',{size:13,weight:700,fill:C.muted})+t(gx,54,`after ${s.years} year${s.years===1?'':'s'}`,{size:12,fill:C.muted});
        sim.forEach((o,i)=>{const x=gx+(i%10)*24,y=gy+Math.floor(i/10)*24;g+=`<circle cx="${x+10}" cy="${y+10}" r="9.5" fill="${o==='safe'?C.green:o==='lost'?'#a49c8c':C.red}"/>`;});
        const cnt=o=>sim.filter(x=>x===o).length;[[cnt('safe'),'safe',C.green],[cnt('lost'),'lost','#8f897c'],[cnt('stolen'),'stolen',C.red]].forEach(([c,l,col],j)=>{g+=t(gx+256,gy+40+j*40,`${c} ${l}`,{size:13,weight:700,fill:col});});
        /* trade-off chart */
        const combos=[];for(let nn=1;nn<=n;nn++)for(let mm=1;mm<=nn;mm++){const r=risk(s.keys.slice(0,nn),mm,opts);combos.push({nn,mm,r});}
        const lo=1e-5,ty0=gy+240;
        const fmtP=v=>v===1?'100%':v===1e-1?'10%':v===1e-3?'0.1%':'0.001%';
        g+=t(gx,ty0+50,'Same keys, other policies',{size:13,weight:700,fill:C.muted})+t(gx,ty0+76,'bottom-left is best',{size:11,fill:C.muted});
        g+=K.plot({x:706,y:ty0+96,w:224,h:190,xr:[lo,1],yr:[lo,1],xlog:true,ylog:true,xticks:[1e-5,1e-3,1e-1],yticks:[1e-5,1e-3,1e-1,1],xfmt:fmtP,yfmt:fmtP,xlabel:'chance of lock-out',ylabel:'chance of theft',
          dots:combos.map(c=>{const cur=c.nn===n&&c.mm===s.m;return {x:Math.max(lo,c.r.lockout),y:Math.max(lo,c.r.theft),color:cur?C.green:'#cfc8b9',r:cur?7:4.5,label:cur||c.nn===n?`${c.mm}-of-${c.nn}`:'',textColor:cur?C.green:C.muted,anchor:c.r.lockout>0.01?'end':'start'};})});
        const H=Math.max(ky0+listH+60,ty0+96+190+76);
        scene.innerHTML=svg(960,H,g,'Multisignature vault, simulated futures and risk trade-off');
        status.textContent=`${s.m}-of-${n} · ${s.years}-year horizon`;
        const total=R.fail,title=n===1?'One key: one way to lose, one way to be robbed.':s.m===n?'All keys required: theft is hard, loss is easy.':s.m===1?'Any key spends: loss is hard, theft is easy.':'A threshold balances loss against theft.';
        const text=n===1?'Everything depends on a single secret. Lose it and the coins are gone; leak it and they are someone else’s.':s.m===n?`A thief needs all ${n} keys, but losing any single one locks you out.`:s.m===1?`You only need one of ${n} keys, so any surviving copy saves you — and any leaked copy lets a thief spend.`:`You can lose up to ${n-s.m} key${n-s.m>1?'s':''} and still spend, while a thief must obtain ${s.m}. Spreading keys across places protects against a single fire.`;
        aside.innerHTML=K.asideBlock({title,text,takeaway:'Adding keys or signatures moves risk between “I can’t spend” and “someone else can”. Where the keys live matters as much as how many there are.',
          stats:K.readouts([['Locked out',prob(R.lockout),R.lockout>0.05?'bad':''],['Stolen',prob(R.theft),R.theft>0.05?'bad':''],['Any failure',prob(total),total>0.1?'bad':'good'],['Keys you can lose',String(n-s.m)]]),
          tries:['Start with “One phone wallet”, then try “2-of-3, spread out”.','Compare “2-of-3, all at home” with “spread out” and raise the fire risk.','Make it 1-of-3: what happens to theft?','Stretch the horizon to 30 years.']});
      }
      segs();draw();
      this.state=()=>({keys:s.keys.slice(),m:s.m,years:s.years,risk:risk(s.keys,s.m,{years:s.years,disaster:s.disaster})});
    }});
})(typeof window!=='undefined'?window:globalThis);

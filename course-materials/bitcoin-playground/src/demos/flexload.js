/* Tool · Mining as a flexible load: switch off when electricity costs more than mining earns. */
(function(root){
  'use strict';
  const PRESETS={
    solar:{label:'Sunny day, solar surplus',p:[78,72,68,66,70,82,96,88,52,20,4,-12,-18,-10,6,30,72,128,176,190,160,128,104,90]},
    winter:{label:'Winter weekday',p:[92,86,82,80,84,104,150,196,178,140,124,118,112,110,116,132,168,214,226,198,160,130,112,100]},
    windy:{label:'Windy night',p:[18,12,8,6,6,14,40,78,96,92,88,84,80,78,82,90,104,126,132,118,96,70,44,28]},
    flat:{label:'Flat tariff',p:Array(24).fill(85)}
  };
  /* Break-even electricity price (€/MWh) = mining revenue per MWh consumed. hashprice in €/PH/day, efficiency in J/TH. */
  const breakEven=(hashprice,eff)=>hashprice/(eff*0.024);
  function day({prices,mw,hashprice,eff,overhead=0,peakHours=0,peakPay=0}){
    const B=breakEven(hashprice,eff),order=prices.map((p,h)=>[p,h]).sort((a,b)=>b[0]-a[0]),peaks=new Set(order.slice(0,peakHours).map(x=>x[1]));
    const hour=(on,h)=>({on,mwh:on?mw:0,revenue:on?mw*B:0,cost:on?mw*(prices[h]+overhead):0,dr:!on&&peaks.has(h)?mw*peakPay:0});
    const always=prices.map((p,h)=>hour(true,h)),flex=prices.map((p,h)=>hour(p+overhead<B&&!peaks.has(h),h));
    const sum=(arr,k)=>arr.reduce((a,x)=>a+x[k],0),tot=arr=>({mwh:sum(arr,'mwh'),revenue:sum(arr,'revenue'),cost:sum(arr,'cost'),dr:sum(arr,'dr'),profit:sum(arr,'revenue')-sum(arr,'cost')+sum(arr,'dr'),hoursOn:arr.filter(x=>x.on).length});
    const top4=new Set(order.slice(0,4).map(x=>x[1])),peakRelief=[...top4].reduce((a,h)=>a+(always[h].mwh-flex[h].mwh),0);
    const cheap=prices.map((p,h)=>[p,h]).filter(([p])=>p<=20).reduce((a,[,h])=>a+flex[h].mwh,0);
    return {B,always,flex,A:tot(always),F:tot(flex),peakRelief,cheapMWh:cheap,peaks};
  }
  const model={PRESETS,breakEven,day};
  if(typeof module!=='undefined'&&module.exports){module.exports=model;return;}

  const K=root.PlaygroundKit,{t,svg,colors:C,fmt}=K;
  const eur=v=>`${v<0?'−':''}€${fmt(Math.abs(v))}`;
  K.register({id:'flexible-load',number:'16',module:'M 2.4',moduleName:'Mining as a flexible load',kind:'Energy',color:C.orange,
    title:'Mining as a flexible load',
    description:'Drag a day of electricity prices. A miner switches off whenever power costs more than mining earns, soaking up cheap surplus and stepping aside at the evening peak.',
    preview(){const p=PRESETS.solar.p;let g='';p.forEach((v,h)=>{const y=120-v*0.45;g+=`<rect x="${20+h*11.5}" y="${Math.min(y,120)}" width="9" height="${Math.abs(120-y)}" fill="${v<85?'#47965d':'#ce5750'}" opacity=".75"/>`;});g+=`<path d="M18 ${120-85*0.45}H300" stroke="#29323c" stroke-dasharray="5 4"/>`;p.forEach((v,h)=>{if(v<85)g+=`<rect x="${20+h*11.5}" y="134" width="9" height="16" fill="#db901e"/>`;});return `<svg viewBox="0 0 320 168">${g}</svg>`;},
    mount(main){
      const s={preset:'solar',prices:PRESETS.solar.p.slice(),mw:10,hashprice:45,eff:20,overhead:10,peakHours:0,peakPay:60,drag:null};
      const specs={mw:{format:v=>`${v} MW`},hashprice:{format:v=>`€${v} / PH / day`},eff:{format:v=>`${v} J/TH`},overhead:{format:v=>`€${v} / MWh`},peakHours:{format:v=>v?`${v} peak hours`:'none'},peakPay:{format:v=>`€${v} / MWh`}};
      main.innerHTML=K.page(this,{layer:'Hourly dispatch · one illustrative day',
        controls:K.segmented({key:'preset',label:'Price day',options:Object.entries(PRESETS).map(([k,v])=>({value:k,label:v.label})),value:s.preset})+K.slider({key:'hashprice',label:'Mining revenue (hashprice)',min:20,max:100,value:s.hashprice,format:specs.hashprice.format})+K.slider({key:'eff',label:'Machine efficiency',min:12,max:40,value:s.eff,format:specs.eff.format,hint:'Lower is better'})+K.slider({key:'overhead',label:'Grid fees and overhead',min:0,max:60,value:s.overhead,format:specs.overhead.format})+K.slider({key:'mw',label:'Site size',min:1,max:50,value:s.mw,format:specs.mw.format})+K.slider({key:'peakHours',label:'Grid asks to switch off in the',min:0,max:6,value:s.peakHours,format:specs.peakHours.format})+K.slider({key:'peakPay',label:'Paid for switching off (demand response)',min:0,max:200,step:5,value:s.peakPay,format:specs.peakPay.format}),
        legend:K.legendItem(C.green,'Price below break-even')+K.legendItem(C.red,'Price above break-even')+K.legendItem(C.orange,'Miner running')+K.legendItem(C.ink,'Break-even price','line'),
        notes:`<ul><li><strong>Break-even price.</strong> Mining revenue per MWh = hashprice ÷ (efficiency × 0.024), with hashprice in €/PH/day and efficiency in J/TH. Above this price (plus fees and overhead) each hour of mining loses money, so a flexible miner switches off.</li><li><strong>Illustrative numbers.</strong> Price days, hashprice and efficiency are teaching assumptions, not market data; hashprice moves with bitcoin's price, network difficulty and fees. Hardware cost, staff, cooling, ramping limits and contract terms (fixed-price power, interruptibility clauses) are ignored, and the hardware is assumed to be paid for: switching off costs only the lost mining revenue.</li><li><strong>Demand response.</strong> Optionally, the grid operator asks the site to switch off during its highest-price hours and pays a fee per MWh not consumed.</li><li>Flexibility is the system benefit discussed in M 2.4: a load that can absorb surplus (low or negative prices) and step aside at peaks. Whether that load is socially worthwhile depends on the counterfactual use of the energy, which this model does not address. The IoT bridge — signed telemetry and authorized dispatch — is covered in the same unit.</li></ul>`});
      const scene=main.querySelector('#scene'),controls=main.querySelector('#controls'),aside=main.querySelector('#aside'),status=main.querySelector('#scene-status');
      K.bindControls(controls,s,specs,key=>{if(key==='preset')s.prices=PRESETS[s.preset].p.slice();draw();});
      const PX=80,PY=48,PW=660,PH=210,yr=[-50,250],sy=v=>PY+PH-(v-yr[0])/(yr[1]-yr[0])*PH,inv=y=>yr[0]+(PY+PH-y)/PH*(yr[1]-yr[0]);
      function svgY(e){const el=scene.querySelector('svg');const pt=el.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;return pt.matrixTransform(el.getScreenCTM().inverse()).y;}
      scene.addEventListener('pointerdown',e=>{const el=e.target.closest('[data-hour]');if(!el)return;s.drag=Number(el.dataset.hour);scene.setPointerCapture(e.pointerId);move(e);});
      const move=e=>{if(s.drag===null)return;s.prices[s.drag]=Math.round(K.clamp(inv(svgY(e)),yr[0],yr[1]));s.preset='custom';K.setSeg(controls,'preset','custom');draw();};
      scene.addEventListener('pointermove',move);scene.addEventListener('pointerup',()=>{s.drag=null;});scene.addEventListener('pointercancel',()=>{s.drag=null;});
      scene.addEventListener('keydown',e=>{const el=e.target.closest('[data-hour]');if(!el)return;const h=Number(el.dataset.hour),d=e.key==='ArrowUp'?10:e.key==='ArrowDown'?-10:0;if(!d)return;e.preventDefault();s.prices[h]=K.clamp(s.prices[h]+d,yr[0],yr[1]);s.preset='custom';K.setSeg(controls,'preset','custom');draw();scene.querySelector(`[data-hour="${h}"]`)?.focus();});
      function draw(){
        const r=day(s),bw=PW/24;let g='';
        g+=t(PX,26,'ELECTRICITY PRICE (€/MWh) · drag the bars',{size:12,weight:700,fill:C.muted});
        [-50,0,50,100,150,200,250].forEach(v=>{g+=`<line x1="${PX}" x2="${PX+PW}" y1="${sy(v)}" y2="${sy(v)}" stroke="${v===0?'#bdb6a6':'#ece6d8'}"/>`+(v%100===0||v===250||v===-50?t(PX-8,sy(v)+7,String(v),{size:11,anchor:'end',fill:C.muted}):'');});
        s.prices.forEach((p,h)=>{const x=PX+h*bw+2,above=p+s.overhead>=r.B,peak=r.peaks.has(h);g+=`<g data-pick="1" data-hour="${h}" tabindex="0" role="slider" aria-label="Hour ${h}: €${p} per MWh" aria-valuenow="${p}"><rect x="${x-2}" y="${PY}" width="${bw}" height="${PH}" fill="transparent"/><rect x="${x}" y="${Math.min(sy(p),sy(0))}" width="${bw-4}" height="${Math.max(1.5,Math.abs(sy(p)-sy(0)))}" rx="2" fill="${above?C.red:C.green}" opacity="${s.drag===h?1:0.78}" ${peak?`stroke="${C.ink}" stroke-width="2"`:''}/></g>`;});
        const ly=sy(r.B-s.overhead);g+=`<line x1="${PX}" x2="${PX+PW}" y1="${ly}" y2="${ly}" stroke="${C.ink}" stroke-width="2" stroke-dasharray="7 5"/>`+t(PX+PW+10,ly-4,'switch off',{size:12,weight:700})+t(PX+PW+10,ly+22,`above €${fmt(r.B-s.overhead)}`,{size:12,weight:700});
        /* load */
        const LY=330,LH=100;g+=t(PX,LY-14,`MINER LOAD (MW) · ${r.F.hoursOn} of 24 hours on`,{size:12,weight:700,fill:C.muted});
        r.flex.forEach((x,h)=>{const bh=x.mwh/s.mw*LH;g+=`<rect x="${PX+h*bw+2}" y="${LY+LH-bh}" width="${bw-4}" height="${bh}" rx="2" fill="${C.orange}"/>`;if(r.peaks.has(h))g+=t(PX+h*bw+bw/2,LY+LH-8,'DR',{size:8,weight:700,anchor:'middle',fill:C.ink});});
        g+=`<line x1="${PX}" x2="${PX+PW}" y1="${LY}" y2="${LY}" stroke="${C.ink}" stroke-dasharray="3 4"/>`+t(PX+PW+10,LY+7,'always on',{size:11,fill:C.muted})+`<line x1="${PX}" x2="${PX+PW}" y1="${LY+LH}" y2="${LY+LH}" stroke="#bdb6a6"/>`;
        [0,6,12,18,23].forEach(h=>{g+=t(PX+h*bw+bw/2,LY+LH+26,`${String(h).padStart(2,'0')}:00`,{size:11,anchor:'middle',fill:C.muted});});
        /* profit comparison: horizontal bars */
        const TY=500;g+=t(PX,TY,'PROFIT FOR THE DAY',{size:12,weight:700,fill:C.muted});
        const vals=[['Always on',r.A.profit,'#bfb8a8'],['Flexible',r.F.profit,C.orange]],neg=vals.some(v=>v[1]<0),zx=neg?470:250,mx=Math.max(1,...vals.map(v=>Math.abs(v[1]))),sc=(neg?260:500)/mx;
        vals.forEach(([lab,v,col],i)=>{const y=TY+18+i*44,w=Math.abs(v)*sc;g+=t(PX,y+24,lab,{size:12,weight:600,fill:C.muted})+`<rect x="${v>=0?zx:zx-w}" y="${y}" width="${Math.max(1,w)}" height="32" rx="4" fill="${col}"/>`+t(v>=0?zx+w+10:zx+10,y+24,eur(v),{size:13,weight:700,fill:v<0?C.red:C.ink});});
        g+=`<line x1="${zx}" x2="${zx}" y1="${TY+10}" y2="${TY+108}" stroke="#bdb6a6"/>`;
        scene.innerHTML=svg(960,620,g,'Hourly electricity prices, miner load and daily profit');
        status.textContent=`${s.mw} MW site · break-even €${fmt(r.B)} / MWh before fees`;
        const gain=r.F.profit-r.A.profit;
        aside.innerHTML=K.asideBlock({title:r.F.hoursOn===24?'Power is cheap all day: run flat out.':r.F.hoursOn===0?'Power costs more than mining earns: stay off.':`Run ${r.F.hoursOn} hours, skip the expensive ${24-r.F.hoursOn}.`,
          text:`Each MWh mined earns about €${fmt(r.B)}. Whenever the price plus €${s.overhead} overhead exceeds that, mining loses money, so the flexible miner switches off — exactly when the grid is tight. Cheap or negative-price hours become its best hours.`,
          takeaway:'A miner is a buyer of last resort that can disappear in seconds: useful flexibility for a grid with variable supply.',
          stats:K.readouts([['Break-even price',`€${fmt(r.B)} / MWh`,'accent'],['Gain from flexibility',eur(gain),gain>0?'good':''],['Energy used',`${fmt(r.F.mwh)} of ${fmt(r.A.mwh)} MWh`],['Removed from 4 priciest hours',`${fmt(r.peakRelief)} MWh`],['Used at ≤ €20 / MWh',`${fmt(r.cheapMWh)} MWh`],['Demand-response income',eur(r.F.dr)]]),
          tries:['Sunny day: which hours does the miner prefer?','Lower the hashprice to €30: how many hours remain?','Swap in newer machines (15 J/TH) on the winter day.','Ask the miner to switch off in 4 peak hours, paid €100 / MWh.']});
      }
      draw();
      this.state=()=>({prices:s.prices.slice(),breakEven:breakEven(s.hashprice,s.eff),flexProfit:day(s).F.profit,alwaysProfit:day(s).A.profit});
    }});
})(typeof window!=='undefined'?window:globalThis);

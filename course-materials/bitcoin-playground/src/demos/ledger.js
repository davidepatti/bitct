/* Tool · Who keeps the ledger? Private notebooks, a central bookkeeper, and a shared validated ledger. */
(function(root){
  'use strict';
  const PLAYERS=['Ana','Ben','Cai','Dee','Eli'],START=5,TOTAL=PLAYERS.length*START;
  const SCENARIOS={
    honest:{label:'Honest payments',events:[{pay:['Ana','Ben',2]},{pay:['Ben','Cai',3]},{pay:['Dee','Eli',1]},{pay:['Cai','Ana',4]}]},
    double:{label:'Cai pays twice',events:[{pay:['Cai','Ben',5]},{pay:['Cai','Dee',5]}]},
    simul:{label:'Twice, at the same moment',events:[{simul:[['Cai','Ben',5],['Cai','Dee',5]]}]},
    abuse:{label:'The bookkeeper misbehaves',central:true,events:[{pay:['Ana','Ben',2]},{censor:['Eli','Ana',2]},{mint:['Ana',10]}]}
  };
  const fresh=()=>Object.fromEntries(PLAYERS.map(p=>[p,START]));
  const clone=o=>JSON.parse(JSON.stringify(o));
  const sum=o=>Object.values(o).reduce((a,b)=>a+b,0);
  /* Returns every step's state so the view can move backward and forward freely. */
  function run(mode,scenario){
    const sc=SCENARIOS[scenario];let own=fresh(),bank=fresh(),copies=Object.fromEntries(PLAYERS.map(p=>[p,fresh()]));
    const view=()=>({own:clone(own),bank:clone(bank),copies:clone(copies)});
    const steps=[{title:`Start: everyone holds ${START} coins (${TOTAL} in total).`,msgs:[],...view()}];
    for(const ev of sc.events){
      const msgs=[];let title='';
      if(ev.pay||ev.simul){
        const pays=ev.pay?[ev.pay]:ev.simul;
        if(mode==='private'){pays.forEach(([f,t,a])=>{const cheat=own[f]<a;own[t]+=a;own[f]-=cheat?0:a;msgs.push({from:f,to:t,label:`${a} coins`,ok:true,cheat});});
          title=pays.length>1||pays.some(()=>false)?`${pays[0][0]} tells ${pays.map(p=>p[1]).join(' and ')} they are paid. Each believes it.`:`${pays[0][0]} pays ${pays[0][1]} ${pays[0][2]}. Only the two of them write it down.`;
          if(ev.pay&&msgs[0].cheat)title=`${ev.pay[0]} pays ${ev.pay[1]} with coins already given away. ${ev.pay[1]} cannot check, so accepts.`;}
        else if(mode==='central'){pays.forEach(([f,t,a])=>{const ok=bank[f]>=a;if(ok){bank[f]-=a;bank[t]+=a;}msgs.push({from:f,to:'Bank',label:`${f}→${t} ${a}`,ok});});
          title=pays.length>1?'The bookkeeper sees one request first and rejects the other: one ledger, one order.':msgs[0].ok?`The bookkeeper checks ${pays[0][0]}'s balance and records the payment.`:`The bookkeeper rejects it: ${pays[0][0]} no longer has the coins.`;}
        else{const orders=PLAYERS.map((p,i)=>pays.length>1&&i>=3?pays.slice().reverse():pays);
          PLAYERS.forEach((p,i)=>orders[i].forEach(([f,t,a])=>{const c=copies[p];if(c[f]>=a){c[f]-=a;c[t]+=a;}}));
          pays.forEach(([f,t,a],k)=>PLAYERS.forEach(p=>{if(p!==f)msgs.push({from:f,to:p,label:k===0?`→${t} ${a}`:'',ok:true,lane:k});}));
          const agree=PLAYERS.every(p=>JSON.stringify(copies[p])===JSON.stringify(copies.Ana));
          title=pays.length>1?(agree?'Everyone applied the same order.':'Messages arrive in different orders: Ana, Ben and Cai accept the payment to Ben; Dee and Eli accept the one to Dee.'):(copies.Ana[pays[0][1]]===steps.at(-1).copies.Ana[pays[0][1]]?`Everyone checks their own copy and rejects it: ${pays[0][0]} has nothing left.`:`${pays[0][0]} announces the payment; every copy checks the balance and records it.`);}
      }
      if(ev.censor){const [f,t,a]=ev.censor;msgs.push({from:f,to:'Bank',label:`${f}→${t} ${a}`,ok:false,censored:true});title=`${f} has the coins, but the bookkeeper refuses to record the payment. ${f} has no other ledger to turn to.`;if(mode!=='central'){own[f]-=a;own[t]+=a;}}
      if(ev.mint){const [t,a]=ev.mint;bank[t]+=a;msgs.push({from:'Bank',to:t,label:`+${a} from nowhere`,ok:false,minted:true});title=`The bookkeeper adds ${a} coins to ${t}'s balance. The ledger looks normal; only the bookkeeper knows.`;}
      const short=ev.pay?`${ev.pay[0]}→${ev.pay[1]} ${ev.pay[2]}`:ev.simul?ev.simul.map(([f,t,a])=>`${f}→${t} ${a}`).join(' & ')+' (same moment)':ev.censor?`${ev.censor[0]}→${ev.censor[1]} ${ev.censor[2]} refused`:`+${ev.mint[1]} to ${ev.mint[0]}`;
      steps.push({title,short,msgs,...view()});
    }
    if(mode==='private'){steps.push({title:'Count the coins: everyone adds up what they believe they own.',msgs:[],reconcile:true,...view()});}
    return steps.map(s=>({...s,claimed:sum(s.own),bankTotal:sum(s.bank),agree:PLAYERS.every(p=>JSON.stringify(s.copies[p])===JSON.stringify(s.copies.Ana))}));
  }
  const model={PLAYERS,START,TOTAL,SCENARIOS,run};
  if(typeof module!=='undefined'&&module.exports){module.exports=model;return;}

  const K=root.PlaygroundKit,{t,svg,colors:C,esc}=K;
  const pos=i=>{const a=-Math.PI/2+i*2*Math.PI/5;return [262+Math.cos(a)*200,262+Math.sin(a)*190];};
  const MODES=[{value:'private',label:'1 · Private notebooks'},{value:'central',label:'2 · A central bookkeeper'},{value:'public',label:'3 · A shared, checked ledger'}];
  K.register({id:'ledger-keepers',number:'02',module:'M 1.1',moduleName:'Motivations',kind:'Ledgers and trust',color:C.purple,
    title:'Who keeps the ledger?',
    description:'Five players and 25 coins. Keep accounts in private notebooks, with one bookkeeper, or in a shared ledger everyone checks — then let Cai try to spend his coins twice.',
    preview(){let g='';[0,1,2,3,4].forEach(i=>{const a=-Math.PI/2+i*2*Math.PI/5,x=160+Math.cos(a)*62,y=84+Math.sin(a)*60;g+=`<circle cx="${x}" cy="${y}" r="15" fill="${i===2?'#f6d6d3':'#e5d8fb'}" stroke="#29323c" stroke-width="1.5"/><rect x="${x+16}" y="${y-12}" width="18" height="24" rx="2" fill="#fffdf7" stroke="#8f897c"/>`;});g+=`<rect x="140" y="66" width="40" height="36" rx="4" fill="#f8d277" stroke="#29323c" stroke-width="1.5"/>`;return `<svg viewBox="0 0 320 168">${g}</svg>`;},
    mount(main){
      const s={mode:'private',scenario:'double',step:0};let steps=run(s.mode,s.scenario);
      main.innerHTML=K.page(this,{tabs:K.tabs('mode',MODES,s.mode),
        notes:`<ul><li><strong>Purpose.</strong> A digital companion to the physical-marbles activity. Coins here are just numbers in ledgers: unlike marbles, information can be copied, so something must stop the same coins being promised twice.</li><li><strong>Private notebooks.</strong> Each player records only the payments they took part in. A payee cannot check whether the payer still owns the coins; the cheat appears only when everyone reconciles.</li><li><strong>Central bookkeeper.</strong> One trusted ledger checks every payment and imposes a single order — but the bookkeeper can also refuse payments (censorship) or create balances, and users cannot tell.</li><li><strong>Shared, checked ledger.</strong> Everyone holds a full copy and validates each announced payment against it. Sequential double spends are rejected by all. But if two conflicting payments circulate at once, honest players can end up with different, individually valid ledgers. Agreeing on <em>one order</em> without a boss is the problem Bitcoin's proof-of-work chain addresses (M 1.3, M 2.3).</li></ul>`,
        controls:'<div id="scen" style="grid-column:1/-1"></div><div class="demo-actions"><button id="lback">← Back</button><button class="primary" id="lnext">Next step →</button><button class="quiet" id="restart">↺ Restart</button><span class="spacer"></span><span class="note" id="stepnote"></span></div>'});
      const scene=main.querySelector('#scene'),controls=main.querySelector('#controls'),aside=main.querySelector('#aside'),layer=main.querySelector('#layer'),status=main.querySelector('#scene-status');
      const q=id=>controls.querySelector('#'+id);
      function buildScen(){const opts=Object.entries(SCENARIOS).filter(([k,v])=>!v.central||s.mode==='central').map(([k,v])=>({value:k,label:v.label}));if(!opts.some(o=>o.value===s.scenario))s.scenario='double';
        q('scen').innerHTML=K.segmented({key:'scenario',label:'Scenario',options:opts,value:s.scenario});K.bindControls(q('scen'),s,{},()=>{steps=run(s.mode,s.scenario);s.step=0;draw();});}
      q('lback').onclick=()=>{s.step=Math.max(0,s.step-1);draw();};q('lnext').onclick=()=>{s.step=Math.min(steps.length-1,s.step+1);draw();};q('restart').onclick=()=>{s.step=0;draw();};
      main.querySelectorAll('.demo-tab').forEach(b=>b.addEventListener('click',()=>{s.mode=b.dataset.value;main.querySelectorAll('.demo-tab').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));buildScen();steps=run(s.mode,s.scenario);s.step=0;draw();}));
      function card(x,y,w,rows,{title='',hl=new Set(),bad=false}={}){let g=`<rect x="${x}" y="${y}" width="${w}" height="${18+rows.length*15}" rx="6" fill="#fffdf7" stroke="${bad?C.red:'#cfc8b9'}" stroke-width="${bad?2:1.2}"/>`;if(title)g+=t(x+8,y+13,title,{size:10,weight:700,fill:C.muted});rows.forEach(([k,v],i)=>{const yy=y+(title?28:14)+i*15;g+=t(x+8,yy,k,{size:11,fill:C.muted})+t(x+w-8,yy,String(v),{size:11.5,weight:700,anchor:'end',fill:hl.has(k)?C.red:C.ink});});return g;}
      function draw(){
        const st=steps[s.step],prev=steps[Math.max(0,s.step-1)];let g='';
        const BX=262,BY=262,BW=160,BH=64,edge=(dx,dy)=>Math.min(BW/2/Math.max(1e-9,Math.abs(dx)),BH/2/Math.max(1e-9,Math.abs(dy)))+8;
        if(s.mode==='central')g+=`<rect x="${BX-BW/2}" y="${BY-BH/2}" width="${BW}" height="${BH}" rx="10" fill="#f8d277" stroke="#29323c" stroke-width="1.8"/>`+t(BX,BY+7,'BOOKKEEPER',{size:11,weight:700,anchor:'middle'});
        /* messages */
        st.msgs.forEach((m,k)=>{const fi=PLAYERS.indexOf(m.from),ti=PLAYERS.indexOf(m.to);const [x1,y1]=m.from==='Bank'?[BX,BY]:pos(fi),[x2,y2]=m.to==='Bank'?[BX,BY]:pos(ti);
          const dx=x2-x1,dy=y2-y1,L=Math.hypot(dx,dy)||1,ux=dx/L,uy=dy/L,off=(m.lane||0)*14-(st.msgs.some(x=>x.lane)?7:0),ox=-uy*off,oy=ux*off,d1=m.from==='Bank'?edge(ux,uy):38,d2=m.to==='Bank'?edge(ux,uy):40,sx=x1+ux*d1+ox,sy=y1+uy*d1+oy,ex=x2-ux*d2+ox,ey=y2-uy*d2+oy;
          const col=m.lane===1?C.orange:m.ok===false?C.red:m.cheat?C.red:C.purple;g+=`<path d="M${sx} ${sy}L${ex} ${ey}" stroke="${col}" stroke-width="2.6" ${m.ok===false?'stroke-dasharray="6 5"':''} marker-end="url(#k-arrow)"/>`;
          if(m.label){const side=(m.lane===1?1:-1),bank=m.to==='Bank'||m.from==='Bank',lx=bank?BX:(sx+ex)/2-uy*18*side,ly=bank?(m.to==='Bank'?BY-BH/2-14:BY+BH/2+30):(sy+ey)/2+ux*18*side+7;g+=t(lx,ly,m.label+(m.ok===false?' ✗':''),{size:11,weight:700,anchor:'middle',fill:col,cls:'halo'});}});
        if(st.msgs.some(m=>m.lane===1))g+=t(20,530,'Purple: Cai → Ben 5  ·  Orange: Cai → Dee 5',{size:12,weight:600,fill:C.muted})+t(20,558,'(announced at the same moment)',{size:12,weight:600,fill:C.muted});
        /* players */
        PLAYERS.forEach((p,i)=>{const [x,y]=pos(i),cheater=p==='Cai'&&s.scenario!=='honest'&&s.scenario!=='abuse';
          g+=`<circle cx="${x}" cy="${y}" r="32" fill="${cheater?'#f6d6d3':'#e5d8fb'}" stroke="#29323c" stroke-width="2"/>`+t(x,y+7,p,{size:13,weight:700,anchor:'middle'});
          if(s.mode!=='central'){const nx=x+(x<BX-20?-60:38),ny=y-46;g+=`<rect x="${nx}" y="${ny}" width="22" height="28" rx="2" fill="#fffdf7" stroke="#8f897c" stroke-width="1.3"/><path d="M${nx+5} ${ny+9}h12M${nx+5} ${ny+15}h12M${nx+5} ${ny+21}h8" stroke="#bdb6a6"/>`;}
        });
        /* right column: the ledger(s) */
        const rx=548,colW=s.mode==='public'?64:150,rowH=32,ty=74;
        if(s.mode==='private'){g+=t(rx,32,'EACH PLAYER’S NOTEBOOK',{size:12,weight:700,fill:C.muted});
          g+=t(rx+150,ty-4,'my coins',{size:10,weight:700,anchor:'end',fill:C.muted})+t(rx+280,ty-4,'others',{size:10,weight:700,anchor:'end',fill:C.muted});
          PLAYERS.forEach((p,i)=>{const y=ty+28+i*rowH;g+=t(rx,y,p,{size:12,weight:700})+t(rx+150,y,String(st.own[p]),{size:12.5,weight:700,anchor:'end',fill:st.own[p]!==prev.own[p]?C.red:C.ink})+t(rx+280,y,'?',{size:12.5,anchor:'end',fill:C.muted});});}
        else if(s.mode==='central'){g+=t(rx,32,'THE BOOKKEEPER’S LEDGER',{size:12,weight:700,fill:C.muted});
          PLAYERS.forEach((p,i)=>{const y=ty+28+i*rowH;g+=t(rx,y,p,{size:12,weight:700})+t(rx+150,y,String(st.bank[p]),{size:12.5,weight:700,anchor:'end',fill:st.bank[p]!==prev.bank[p]?C.purple:C.ink});});}
        else{g+=t(rx,32,'EACH PLAYER’S COPY',{size:12,weight:700,fill:C.muted});
          const cx0=rx+76;PLAYERS.forEach((owner,j)=>{const c=st.copies[owner],diff=PLAYERS.some(q=>c[q]!==st.copies.Ana[q]);const X=cx0+j*colW;
            g+=`<rect x="${X}" y="${ty-26}" width="${colW-6}" height="${32+5*rowH}" rx="7" fill="${!st.agree&&diff?'#fbeeec':'#fffdf7'}" stroke="${!st.agree&&diff?C.red:'#cfc8b9'}" stroke-width="${!st.agree&&diff?2:1.2}"/>`+t(X+(colW-6)/2,ty-4,owner,{size:10,weight:700,anchor:'middle',fill:C.muted});
            PLAYERS.forEach((q,i)=>{const y=ty+28+i*rowH;g+=t(X+(colW-6)/2,y,String(c[q]),{size:12,weight:700,anchor:'middle',fill:c[q]!==st.copies.Ana[q]?C.red:C.ink});});});
          PLAYERS.forEach((q,i)=>{g+=t(rx,ty+28+i*rowH,q,{size:11,fill:C.muted});});
          g+=t(rx,ty+28+5*rowH+10,'columns: whose copy · rows: account',{size:10,fill:C.muted});}
        let verdict,vcol;
        if(s.mode==='private'){verdict=st.reconcile?(st.claimed>TOTAL?`${st.claimed} coins claimed, only ${TOTAL} exist`:`${st.claimed} claimed = ${TOTAL} exist`):'Total unknown until notes are compared';vcol=st.reconcile&&st.claimed>TOTAL?C.red:C.muted;}
        else if(s.mode==='central'){verdict=st.bankTotal!==TOTAL?`Ledger total ${st.bankTotal} ≠ ${TOTAL}`:st.msgs.some(m=>m.censored)?'Valid payment refused':st.msgs.some(m=>m.ok===false)?'Double spend stopped':`Ledger total ${st.bankTotal}`;vcol=st.bankTotal!==TOTAL||st.msgs.some(m=>m.censored)?C.red:st.msgs.some(m=>m.ok===false)?C.green:C.ink;}
        else{verdict=st.agree?'All copies agree':'Copies disagree';vcol=st.agree?C.green:C.red;}
        const cy0=ty+28+5*rowH+(s.mode==='public'?64:30),vl=[''];verdict.split(' ').forEach(w=>{if((vl.at(-1)+' '+w).trim().length>30)vl.push(w);else vl[vl.length-1]=(vl.at(-1)+' '+w).trim();});const ex=(vl.length-1)*30;
        g+=t(rx,cy0,'CHECK',{size:12,weight:700,fill:C.muted});vl.forEach((l,i)=>{g+=t(rx,cy0+34+i*30,l,{size:15,weight:700,fill:vcol});});
        g+=t(rx,cy0+84+ex,'STEPS',{size:12,weight:700,fill:C.muted});
        steps.forEach((x,i)=>{const y=cy0+120+ex+i*34;g+=`<circle cx="${rx+12}" cy="${y-6}" r="12" fill="${i===s.step?C.purple:i<s.step?'#cdbdf0':'#efeadf'}"/>`+t(rx+12,y,String(i),{size:10,weight:700,anchor:'middle',fill:i===s.step?'#fff':C.ink})+t(rx+34,y,i===0?'Start':x.reconcile?'Count the coins':x.short.replace(' (same moment)',' at once'),{size:11.5,fill:i===s.step?C.ink:C.muted,weight:i===s.step?700:500});});
        const H=Math.max(580,cy0+120+ex+(steps.length-1)*34+24);
        scene.innerHTML=svg(960,H,g,'Five players and their ledgers');
        q('lback').disabled=s.step===0;q('lnext').disabled=s.step===steps.length-1;q('stepnote').textContent=`Step ${s.step} of ${steps.length-1}`;
        layer.textContent=MODES.find(m=>m.value===s.mode).label.slice(4);status.textContent=SCENARIOS[s.scenario].label;
        const end=s.step===steps.length-1;
        const takeaway=s.mode==='private'?'Without a shared record, a payee cannot verify that coins still exist.':s.mode==='central'?'A central ledger solves double spending by trusting one party with everything — including censorship and creating money.':'Shared validation removes the boss, but the network still needs a way to agree on one order of events.';
        aside.innerHTML=K.asideBlock({eyebrow:`STEP ${s.step} OF ${steps.length-1}`,title:st.title,takeaway,
          stats:K.readouts(s.mode==='private'?[['Coins that exist',TOTAL],['Coins claimed',st.reconcile?st.claimed:'?',st.reconcile&&st.claimed>TOTAL?'bad':'']]:s.mode==='central'?[['Coins in the ledger',st.bankTotal,st.bankTotal!==TOTAL?'bad':''],['Who you trust','the bookkeeper','accent']]:[['Ledger copies',PLAYERS.length],['Copies agree',st.agree?'yes':'no',st.agree?'good':'bad']]),
          tries:end?['Switch to the next model and replay the same scenario.','Try “Twice, at the same moment” under all three models.','With the bookkeeper: could the players prove the cheating?']:['Press “Next step” and watch who learns about each payment.']});
      }
      buildScen();draw();
      this.state=()=>({mode:s.mode,scenario:s.scenario,step:s.step,steps:steps.length,last:steps.at(-1)});
    }});
})(typeof window!=='undefined'?window:globalThis);

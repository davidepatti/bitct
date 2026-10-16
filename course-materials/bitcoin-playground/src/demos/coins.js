/* Tool 03 · Coin purse: UTXO selection, transaction size, fee rate and change. */
(function(root){
  'use strict';
  /* Typical virtual sizes (vB). Witness bytes count one quarter. Key-path Taproot spends assumed. */
  const TYPES={
    legacy:{label:'Legacy P2PKH',input:148,output:34,overhead:10,dust:546},
    segwit:{label:'SegWit P2WPKH',input:68,output:31,overhead:10.5,dust:294},
    taproot:{label:'Taproot P2TR',input:57.5,output:43,overhead:10.5,dust:330}
  };
  const WALLET=[1200,2500,4800,9000,15000,27000,52000,95000,180000,320000];
  const vsize=(nIn,nOut,type)=>Math.ceil(TYPES[type].overhead+nIn*TYPES[type].input+nOut*TYPES[type].output);
  const spendCost=(rate,type)=>rate*TYPES[type].input;
  const effective=(value,rate,type)=>value-spendCost(rate,type);
  /* Order coins by strategy; manual uses the given selection. */
  function order(coins,strategy){const idx=coins.map((v,i)=>i);if(strategy==='largest')return idx.sort((a,b)=>coins[b]-coins[a]);if(strategy==='smallest')return idx.sort((a,b)=>coins[a]-coins[b]);return idx;}
  function settle(coins,chosen,payment,rate,type){
    const sum=chosen.reduce((a,i)=>a+coins[i],0),n=chosen.length,dust=TYPES[type].dust;
    const sizeChange=vsize(n,2,type),sizeNo=vsize(n,1,type),feeChange=Math.ceil(sizeChange*rate),feeNo=Math.ceil(sizeNo*rate);
    if(n&&sum-payment-feeChange>=dust)return {ok:true,inputs:chosen,sum,change:sum-payment-feeChange,fee:feeChange,size:sizeChange,outputs:2,dropped:0};
    if(n&&sum-payment-feeNo>=0)return {ok:true,inputs:chosen,sum,change:0,fee:sum-payment,size:sizeNo,outputs:1,dropped:sum-payment-feeNo};
    return {ok:false,inputs:chosen,sum,change:0,fee:0,size:sizeNo,outputs:1,dropped:0,missing:payment+feeNo-sum};
  }
  function build({coins=WALLET,payment,rate,type='segwit',strategy='largest',manual=[]}){
    if(strategy==='manual')return settle(coins,[...manual].sort((a,b)=>a-b),payment,rate,type);
    const chosen=[];for(const i of order(coins,strategy)){chosen.push(i);const r=settle(coins,chosen,payment,rate,type);if(r.ok)return r;}
    return settle(coins,chosen,payment,rate,type);
  }
  const model={TYPES,WALLET,vsize,spendCost,effective,build,settle};
  if(typeof module!=='undefined'&&module.exports){module.exports=model;return;}

  const K=root.PlaygroundKit,{t,svg,colors:C,group,pct,fmt}=K;
  K.register({id:'coin-purse',number:'07',module:'M 2.1',moduleName:'Transactions',kind:'UTXOs and fees',color:C.blue,
    title:'Coin purse and fee builder',
    description:'Pay Bob from a wallet of UTXO “coins”. Change the fee rate and coin-selection strategy and watch size, fee and change react — and small coins become worthless.',
    preview(){let g='';[[40,30,90],[40,70,60],[40,100,36],[40,128,20]].forEach(([x,y,w],i)=>{g+=`<rect x="${x}" y="${y}" width="${w}" height="22" rx="11" fill="${i<2?'#bfdaef':'#f1ece0'}" stroke="#29323c" stroke-width="1.4"/>`;});
      g+=`<rect x="170" y="28" width="36" height="96" fill="#9cc6e8" stroke="#29323c" stroke-width="1.4"/><path d="M210 76H232" stroke="#29323c" stroke-width="1.6"/><rect x="236" y="28" width="36" height="58" fill="#3177c8"/><rect x="236" y="86" width="36" height="30" fill="#47965d"/><rect x="236" y="116" width="36" height="8" fill="#db901e"/><rect x="236" y="28" width="36" height="96" fill="none" stroke="#29323c" stroke-width="1.4"/>`;return `<svg viewBox="0 0 320 168">${g}</svg>`;},
    mount(main){
      const s={payment:60000,rate:12,strategy:'largest',type:'segwit',manual:new Set([7])};
      const specs={payment:{format:v=>group(v)+' sats',round:v=>Math.round(v/1000)*1000},rate:{format:v=>fmt(v,v<10?1:0)+' sat/vB',round:v=>v<10?Math.round(v*2)/2:Math.round(v)}};
      main.innerHTML=K.page(this,{layer:'Wallet coin selection · one payment',
        controls:K.slider({key:'payment',label:'Pay Bob',min:5000,max:600000,step:1000,value:s.payment,format:specs.payment.format})+K.slider({key:'rate',label:'Fee rate',min:1,max:300,log:true,value:s.rate,format:specs.rate.format,hint:'Set by competition for block space'})+
          K.segmented({key:'strategy',label:'Coin selection',options:[{value:'largest',label:'Largest first'},{value:'smallest',label:'Smallest first'},{value:'manual',label:'Pick by hand'}],value:s.strategy})+
          K.segmented({key:'type',label:'Wallet address type',options:Object.entries(TYPES).map(([k,v])=>({value:k,label:v.label.split(' ')[0]})),value:s.type}),
        legend:K.legendItem('#9cc6e8','Inputs (coins spent)')+K.legendItem(C.blue,'Payment to Bob')+K.legendItem(C.green,'Change back to Alice')+K.legendItem(C.orange,'Fee to the miner')+K.legendItem(C.red,'Coin worth less than its spending cost'),
        notes:`<ul><li><strong>Sizes.</strong> Virtual sizes are typical single-signature values: P2PKH input 148 vB / output 34 vB; P2WPKH 68 / 31; P2TR key-path 57.5 / 43; plus about 10–10.5 vB of transaction overhead. Witness data counts one quarter, which is why SegWit and Taproot inputs are cheaper.</li><li><strong>Fee.</strong> fee = fee rate × virtual size, rounded up. Miners compare fee rates, not absolute fees, because block space is the scarce resource.</li><li><strong>Change.</strong> If change would be below the default dust threshold (546, 294 or 330 sats here), the wallet drops the change output and the remainder becomes extra fee. Real wallets also consider the future cost of spending the change.</li><li><strong>Strategies.</strong> “Largest first” and “smallest first” are teaching extremes. Bitcoin Core combines several algorithms (branch-and-bound, knapsack, single random draw) and weighs fees now against fees later.</li><li>Effective value = coin value − fee rate × input size. A coin with negative effective value costs more to spend than it contributes.</li></ul>`});
      const scene=main.querySelector('#scene'),controls=main.querySelector('#controls'),aside=main.querySelector('#aside'),status=main.querySelector('#scene-status');
      let lastAuto=[];
      K.bindControls(controls,s,specs,key=>{if(key==='strategy'&&s.strategy==='manual')s.manual=new Set(lastAuto);draw();});
      scene.addEventListener('click',e=>{const el=e.target.closest('[data-coin]');if(!el)return;toggle(Number(el.dataset.coin));});
      scene.addEventListener('keydown',e=>{const el=e.target.closest('[data-coin]');if(el&&(e.key==='Enter'||e.key===' ')){e.preventDefault();toggle(Number(el.dataset.coin));scene.querySelector(`[data-coin="${el.dataset.coin}"]`)?.focus();}});
      function toggle(i){if(s.strategy!=='manual'){const r=build({payment:s.payment,rate:s.rate,type:s.type,strategy:s.strategy});s.manual=new Set(r.inputs);s.strategy='manual';K.setSeg(controls,'strategy','manual');}if(s.manual.has(i))s.manual.delete(i);else s.manual.add(i);draw();}
      function draw(){
        const r=build({payment:s.payment,rate:s.rate,type:s.type,strategy:s.strategy,manual:s.manual}),T=TYPES[s.type],cost=spendCost(s.rate,s.type);
        if(s.strategy!=='manual')lastAuto=r.inputs.slice();
        let g='';
        g+=t(24,30,'ALICE’S WALLET · 10 COINS (UTXOs)',{size:12,weight:700,fill:C.muted});
        const maxV=Math.max(...WALLET);
        WALLET.forEach((v,i)=>{const y=46+i*44,used=r.inputs.includes(i),eff=v-cost,neg=eff<0,w=40+Math.sqrt(v/maxV)*130;
          g+=`<g data-pick="1" data-coin="${i}" tabindex="0" role="button" aria-pressed="${used}" aria-label="Coin of ${group(v)} sats${used?', selected':''}">`;
          g+=`<rect x="20" y="${y}" width="300" height="38" rx="8" fill="${used?'#e4f0fa':'transparent'}" stroke="${used?C.blue:'transparent'}" stroke-width="1.5"/>`;
          g+=`<rect x="30" y="${y+8}" width="${w}" height="22" rx="11" fill="${neg?'#f6d6d3':used?'#9cc6e8':'#f1ece0'}" stroke="${neg?C.red:'#29323c'}" stroke-width="1.4"/>`;
          g+=t(42,y+24,group(v),{size:13,weight:700});
          g+=t(312,y+16,neg?'costs more than it holds':`spend cost ${group(cost)}`,{size:11,anchor:'end',fill:neg?C.red:C.muted,weight:neg?700:500});
          g+=t(312,y+31,`effective ${eff<0?'−':''}${group(Math.abs(eff))}`,{size:11,anchor:'end',fill:neg?C.red:C.muted});
          g+=`</g>`;
        });
        /* conservation stack */
        const total=Math.max(r.sum,s.payment+r.fee,1),H=360,top=70,sc=H/total,X1=420,X2=600;
        g+=t(X1+30,36,'INPUTS',{size:12,weight:700,anchor:'middle',fill:C.muted})+t(X2+30,36,'OUTPUTS',{size:12,weight:700,anchor:'middle',fill:C.muted});
        let y=top;r.inputs.slice().sort((a,b)=>WALLET[b]-WALLET[a]).forEach(i=>{const h=WALLET[i]*sc;g+=`<rect x="${X1}" y="${y}" width="60" height="${Math.max(1,h)}" fill="#9cc6e8" stroke="#29323c" stroke-width="1"/>`;if(h>16)g+=t(X1+30,y+h/2+4,group(WALLET[i]),{size:11,anchor:'middle',weight:600});y+=h;});
        if(!r.ok){const h=(r.missing||0)*sc;g+=`<rect x="${X1}" y="${y}" width="60" height="${h}" fill="none" stroke="${C.red}" stroke-width="2" stroke-dasharray="5 4"/>`+t(X1-10,y+Math.min(h,40)/2+4,`missing ${group(r.missing)}`,{size:12,anchor:'end',fill:C.red,weight:700});}
        g+=`<path d="M${X1+70} ${top+Math.min(H,r.sum*sc)/2}H${X2-12}" stroke="#29323c" stroke-width="2" marker-end="url(#k-arrow)"/>`;
        const outs=[[s.payment,C.blue,'Bob',`${group(s.payment)} sats`],[r.change,C.green,'Change',r.change?`${group(r.change)} sats`:r.ok&&r.dropped?'none (would be dust)':'none'],[r.fee,C.orange,'Fee',`${group(r.fee)} sats`]];
        y=top;let ly=top;outs.forEach(([v,col,name,lab],k)=>{const h=v*sc;if(v>0)g+=`<rect x="${X2}" y="${y}" width="60" height="${Math.max(2.5,h)}" fill="${col}" stroke="#29323c" stroke-width="1"/>`;const cy=Math.max(ly,y+Math.max(2.5,h)/2);g+=t(X2+74,cy-2,name,{size:14,weight:700,fill:col})+t(X2+74,cy+15,lab,{size:12,fill:C.muted});ly=cy+44;y+=Math.max(v>0?2.5:0,h);});
        if(r.ok)g+=t(X2+74,ly+6,`${fmt(r.fee/r.size,1)} sat/vB × ${r.size} vB`,{size:12,fill:C.orange,weight:600});
        /* size bar */
        const by=470,bw=520,bx=420,tot=r.size||1;g+=t(bx,by-10,`TRANSACTION SIZE · ${r.size} vB`,{size:12,weight:700,fill:C.muted});
        const parts=[[T.overhead,'#cfc8b9','overhead'],[r.inputs.length*T.input,'#9cc6e8',`${r.inputs.length} input${r.inputs.length===1?'':'s'} × ${T.input}`],[r.outputs*T.output,'#b7d9bd',`${r.outputs} output${r.outputs===1?'':'s'} × ${T.output}`]];
        let bx2=bx;parts.forEach(([v,col,lab])=>{const w=v/tot*bw;g+=`<rect x="${bx2}" y="${by}" width="${w}" height="18" fill="${col}" stroke="#fffdf7"/>`;if(w>70)g+=t(bx2+5,by+13,lab,{size:11,weight:600});bx2+=w;});
        scene.innerHTML=svg(960,500,g,'Coin selection and the resulting transaction');
        status.textContent=r.ok?`${T.label} · ${r.inputs.length} in → ${r.outputs} out`:'Not enough funds selected';
        const uneconomic=WALLET.filter(v=>effective(v,s.rate,s.type)<0).length;
        const title=!r.ok?'Not enough coins selected.':uneconomic>=3?'At this fee rate, small coins are dead weight.':r.inputs.length>=4?'Many inputs make a big, expensive transaction.':r.dropped>0?'The leftover was too small to keep.':'Inputs = payment + change + fee.';
        const text=!r.ok?`The selected coins fall ${group(r.missing)} sats short of the payment plus fee. Add a coin or reduce the payment.`:uneconomic>=3?`Spending one ${T.label.split(' ')[1]} input adds ${T.input} vB, which costs ${group(cost)} sats at ${fmt(s.rate,s.rate<10?1:0)} sat/vB. ${uneconomic} of Alice’s coins are worth less than that.`:r.inputs.length>=4?'Every input carries its own signature data. The fee pays for bytes, not for the amount sent, so many small coins cost more than one large coin.':r.dropped>0?`Change of ${group(r.dropped)} sats would be below the dust threshold (${T.dust} sats), so the wallet left it to the miner instead of creating an output nobody can economically spend.`:'Nothing is “sent” from a balance. The transaction consumes whole coins and creates new outputs; whatever is not assigned to an output is the fee.';
        aside.innerHTML=K.asideBlock({title,text,takeaway:'The fee depends on the transaction’s size in vbytes and the fee rate, not on the amount paid.',
          stats:K.readouts([['Coins spent',fmt(r.inputs.length)],['Size',`${r.size} vB`],['Fee',`${group(r.fee)} sats`,'accent'],['Fee vs. payment',r.ok?pct(r.fee/s.payment):'—'],['Change',r.ok?`${group(r.change)} sats`:'—'],['Coins not worth spending',`${uneconomic} of 10`,uneconomic?'bad':'good']]),
          tries:['Raise the fee rate to 100 sat/vB. Which coins turn red?','Compare “largest first” with “smallest first” for the same payment.','Switch Legacy → SegWit → Taproot and watch the size bar shrink.','Pick coins by hand so the change is tiny. What happens to it?']});
      }
      draw();
      this.state=()=>({...s,manual:[...s.manual],result:build({payment:s.payment,rate:s.rate,type:s.type,strategy:s.strategy,manual:s.manual})});
    }});
})(typeof window!=='undefined'?window:globalThis);

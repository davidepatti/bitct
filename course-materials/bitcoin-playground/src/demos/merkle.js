/* Tool 05 · Merkle tree explorer: commitments, tamper evidence and compact inclusion proofs. */
(function(root){
  'use strict';
  const P=root.PlaygroundProtocol||(typeof require!=='undefined'?require('../protocol.js'):null);
  const enc=s=>new TextEncoder().encode(s);
  const sha256d=bytes=>P.sha256(P.sha256(bytes));
  const concat=(a,b)=>{const out=new Uint8Array(a.length+b.length);out.set(a);out.set(b,a.length);return out;};
  const leaf=text=>sha256d(enc(text));
  /* Bitcoin's rule: hash pairs with double SHA-256; an odd level duplicates its last hash. */
  function levels(hashes){
    const out=[hashes.map(h=>({hash:h,dup:false}))];
    while(out.at(-1).length>1){const lvl=out.at(-1).map(n=>n.hash);if(lvl.length%2){lvl.push(lvl.at(-1));out.at(-1).push({hash:lvl.at(-1),dup:true});}
      const next=[];for(let i=0;i<lvl.length;i+=2)next.push({hash:sha256d(concat(lvl[i],lvl[i+1])),dup:false});out.push(next);}
    return out;
  }
  const rootOf=hashes=>levels(hashes).at(-1)[0].hash;
  function proof(lv,index){const path=[];let i=index;for(let d=0;d<lv.length-1;d++){const sib=i%2?i-1:i+1;path.push({level:d,index:sib,hash:lv[d][sib].hash,left:i%2===1});i=Math.floor(i/2);}return path;}
  function verify(hash,path,expected){let h=hash;for(const step of path)h=step.left?sha256d(concat(step.hash,h)):sha256d(concat(h,step.hash));return P.hex(h)===P.hex(expected);}
  /* Displayed txids are byte-reversed relative to the internal hashing order. */
  const fromTxid=hex=>Uint8Array.from(hex.match(/../g).map(b=>parseInt(b,16))).reverse();
  const toTxid=bytes=>P.hex(Uint8Array.from(bytes).reverse());
  const proofSize=n=>n<=1?0:Math.ceil(Math.log2(n));
  const model={leaf,levels,rootOf,proof,verify,fromTxid,toTxid,proofSize,sha256d};
  if(typeof module!=='undefined'&&module.exports){module.exports=model;return;}

  const K=root.PlaygroundKit,{t,svg,colors:C,fmt,group,esc}=K;
  const DATA={
    block:{name:'Block transactions',items:['coinbase → miner 3.125 BTC','Alice → Bob 0.010 BTC','Carol → Dan 0.200 BTC','Erin → Frank 0.035 BTC','Gus → Hana 1.500 BTC','Ivan → Judy 0.004 BTC','Kim → Leo 0.120 BTC','Mia → Ned 0.075 BTC','Oli → Pam 2.000 BTC','Quin → Rae 0.018 BTC','Sam → Tia 0.660 BTC','Uma → Vic 0.090 BTC','Wes → Xia 0.300 BTC','Yan → Zoe 0.051 BTC','Ada → Ben 0.007 BTC','Cy → Dee 0.420 BTC'],tamper:s=>s.replace(/(\d)\.(\d)/,(m,a,b)=>`${(Number(a)+9)%10}.${b}`),short:s=>s.split(' ').slice(0,3).join(' ')},
    sensor:{name:'Sensor records',items:Array.from({length:16},(_,i)=>`D17 · 12:${String(i*4).padStart(2,'0')} · ${[431,428,433,440,452,447,439,436,430,425,421,419,418,423,429,434][i]} W`),tamper:s=>s.replace(/· (\d)(\d\d) W/,(m,a,b)=>`· ${(Number(a)+7)%10}${b} W`),short:s=>s.split(' · ').slice(1).join(' ')}
  };
  K.register({id:'merkle-tree',number:'10',module:'M 2.2',moduleName:'Chaining and proof of work',kind:'Commitments',color:C.orange,
    title:'Merkle tree explorer',
    description:'Change one transaction and watch the damage climb to the block header. Then prove a transaction is included using only a handful of hashes.',
    preview(){let g='';const lv=[[0,1,2,3,4,5,6,7],[0,1,2,3],[0,1],[0]];lv.forEach((row,d)=>{const y=140-d*38,w=280/row.length;row.forEach((_,i)=>{const x=20+w*i+w/2;const hot=(d===0&&i===5)||(d===1&&i===2)||(d===2&&i===1)||d===3;g+=`<rect x="${x-14}" y="${y-10}" width="28" height="20" rx="4" fill="${hot?'#f6d6d3':'#f7daa0'}" stroke="${hot?'#ce5750':'#29323c'}" stroke-width="1.4"/>`;if(d<3){const px=20+(280/(row.length/2))*Math.floor(i/2)+280/(row.length/2)/2;g+=`<path d="M${x} ${y-10}L${px} ${y-28}" stroke="#a49c8c" stroke-width="1"/>`;}});});return `<svg viewBox="0 0 320 168">${g}</svg>`;},
    mount(main){
      const s={n:8,data:'block',mode:'tamper',tampered:new Set(),selected:3,big:4000};
      const specs={n:{format:v=>`${v} item${v===1?'':'s'}`},big:{format:v=>group(v),round:v=>Math.round(v)}};
      main.innerHTML=K.page(this,{layer:'Merkle tree · double SHA-256',
        controls:K.slider({key:'n',label:'Number of leaves',min:1,max:16,value:s.n,format:specs.n.format,hint:'Try an odd number'})+K.segmented({key:'mode',label:'Click a leaf to …',options:[{value:'tamper',label:'Tamper with it'},{value:'prove',label:'Prove it is included'}],value:s.mode})+K.segmented({key:'data',label:'Leaves are …',options:[{value:'block',label:'Transactions'},{value:'sensor',label:'Sensor records'}],value:s.data})+K.slider({key:'big',label:'Scale up: leaves in a real batch',min:1,max:1000000,log:true,value:s.big,format:specs.big.format})+`<div class="demo-actions"><button id="restore">↺ Restore original data</button><span class="note" id="hint"></span></div>`,
        legend:K.legendItem('#f7daa0','Hash (color = first bytes)')+K.legendItem(C.red,'Changed by tampering')+K.legendItem(C.purple,'Leaf being proven')+K.legendItem(C.orange,'Sibling hash sent in the proof')+K.legendItem('transparent;border:1.5px dashed #8f897c','Duplicated (odd level)'),
        notes:`<ul><li><strong>Real hashing.</strong> Each leaf is the double SHA-256 of its text, standing in for a txid; each parent is the double SHA-256 of its two children’s 32-byte hashes, concatenated. Boxes show the first four bytes.</li><li><strong>Odd levels.</strong> Bitcoin duplicates the last hash of an odd-length level. This is why the dashed copy appears. (It also enabled a historical duplicate-transaction ambiguity, CVE-2012-2459, which nodes now check for.)</li><li><strong>Inclusion proof.</strong> To check a leaf, a verifier needs the leaf, the sibling hash at each level, and a trusted root. That is ⌈log₂ n⌉ hashes. The proof only shows that the leaf is committed under that root; whether the block is valid and on the most-work chain is a separate question (the SPV trust boundary).</li><li><strong>Anchoring.</strong> The same structure batches thousands of device records into one 32-byte root that can be committed on chain (M 4.3). Each device later receives its own short receipt (a Merkle path).</li><li>Display byte order: block explorers print txids and Merkle roots byte-reversed. The automated tests check this implementation against the published root of block 100,000.</li></ul>`});
      const scene=main.querySelector('#scene'),controls=main.querySelector('#controls'),aside=main.querySelector('#aside'),status=main.querySelector('#scene-status');
      K.bindControls(controls,s,specs,key=>{if(key==='n'||key==='data'){s.tampered=new Set([...s.tampered].filter(i=>i<s.n));s.selected=Math.min(s.selected,s.n-1);}draw();});
      controls.querySelector('#restore').onclick=()=>{s.tampered.clear();draw();};
      const pick=i=>{if(s.mode==='tamper'){if(s.tampered.has(i))s.tampered.delete(i);else s.tampered.add(i);}else s.selected=i;draw();scene.querySelector(`[data-leaf="${i}"]`)?.focus();};
      scene.addEventListener('click',e=>{const el=e.target.closest('[data-leaf]');if(el)pick(Number(el.dataset.leaf));});
      scene.addEventListener('keydown',e=>{const el=e.target.closest('[data-leaf]');if(el&&(e.key==='Enter'||e.key===' ')){e.preventDefault();pick(Number(el.dataset.leaf));}});
      function draw(){
        const D=DATA[s.data],texts=D.items.slice(0,s.n),now=texts.map((x,i)=>s.tampered.has(i)?D.tamper(x):x);
        const orig=levels(texts.map(leaf)),lv=levels(now.map(leaf)),depth=lv.length;
        const pathNodes=new Set(),sibs=new Map();if(s.mode==='prove'){let i=s.selected;proof(lv,s.selected).forEach((p,k)=>sibs.set(`${p.level}:${p.index}`,k+1));for(let d=0;d<depth;d++){pathNodes.add(`${d}:${i}`);i=Math.floor(i/2);}}
        const W=920,X0=20,top=158,bottom=468,rowH=depth>1?(bottom-top)/(depth-1):0,compact=lv[0].length>8;
        const pos=(d,i)=>{const count=lv[d].length;const w=W/count;return [X0+w*i+w/2,bottom-d*rowH];};
        const boxW=d=>Math.min(d===depth-1?150:130,W/lv[d].length-10),chars=w=>Math.max(4,Math.min(8,Math.floor((w-10)/(K.fs(11)*0.62))));
        let g='';
        /* header */
        const tamperedRoot=P.hex(lv.at(-1)[0].hash)!==P.hex(orig.at(-1)[0].hash);
        g+=`<rect x="200" y="6" width="560" height="74" rx="8" fill="#fffdf7" stroke="#29323c" stroke-width="1.6"/>`+t(218,34,'BLOCK HEADER · committed by proof of work',{size:11,weight:700,fill:C.muted})+t(218,66,`Merkle root ${P.hex(orig.at(-1)[0].hash).slice(0,16)}…`,{size:12,cls:'mono'});
        g+=`<path d="M480 80V${top-20}" stroke="${tamperedRoot?C.red:'#29323c'}" stroke-width="2" ${tamperedRoot?'stroke-dasharray="6 5"':''}/>`;
        if(tamperedRoot)g+=t(494,116,'✗ root no longer matches the header',{size:12,weight:700,fill:C.red});
        /* edges */
        for(let d=0;d<depth-1;d++)lv[d].forEach((n,i)=>{const [x,y]=pos(d,i),[px,py]=pos(d+1,Math.floor(i/2));const hot=pathNodes.has(`${d}:${i}`);const changed=P.hex(n.hash)!==P.hex((orig[d][i]||{}).hash||new Uint8Array());g+=`<path d="M${x} ${y-18}L${px} ${py+18}" stroke="${hot?C.purple:changed?C.red:'#b9b1a1'}" stroke-width="${hot||changed?2.2:1.2}"/>`;});
        /* nodes */
        lv.forEach((row,d)=>row.forEach((n,i)=>{const [x,y]=pos(d,i),hx=P.hex(n.hash),changed=hx!==P.hex((orig[d][i]||{}).hash||new Uint8Array()),key=`${d}:${i}`,sib=sibs.get(key),onPath=pathNodes.has(key),isLeaf=d===0,isRoot=d===depth-1;
          const fill=onPath&&isLeaf?'#e5d8fb':`hsl(${K.hue(hx)} 62% ${changed?90:86}%)`,stroke=sib?C.orange:onPath?C.purple:changed?C.red:'#29323c',sw=sib||onPath||changed?2.6:1.3;
          const w=boxW(d),h=36;
          g+=`<g ${isLeaf&&!n.dup?`data-pick="1" data-leaf="${i}" tabindex="0" role="button" aria-label="${esc(now[i])}${s.tampered.has(i)?', tampered':''}"`:''}><rect x="${x-w/2}" y="${y-h/2}" width="${w}" height="${h}" rx="5" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${n.dup?'stroke-dasharray="4 3" opacity=".6"':''}/>`;
          g+=t(x,y+7,hx.slice(0,chars(w)),{size:11,anchor:'middle',cls:'mono',fill:changed?'#a3332d':C.ink});
          if(sib)g+=`<circle cx="${x+w/2-2}" cy="${y-h/2-2}" r="13" fill="${C.orange}"/>`+t(x+w/2-2,y-h/2+5,String(sib),{size:10,weight:700,anchor:'middle',fill:'#fff'});
          if(isRoot)g+=t(x-w/2-10,y+7,'root',{size:12,weight:700,anchor:'end',fill:C.muted});
          if(isLeaf&&!n.dup){const hl=s.tampered.has(i)||(s.mode==='prove'&&i===s.selected);
            if(compact)g+=t(x,y+h/2+26,`tx${i+1}`,{size:10,anchor:'middle',fill:s.tampered.has(i)?C.red:hl?C.purple:C.muted,weight:hl?700:500});
            else{const lab=D.short(now[i]),parts=lab.includes('→')?[lab.split('→')[0].trim(),'→ '+lab.split('→')[1].trim()]:[lab.split(' ')[0],lab.split(' ').slice(1).join(' ')];parts.forEach((l,k)=>{g+=t(x,y+h/2+26+k*24,l,{size:10,anchor:'middle',fill:s.tampered.has(i)?C.red:C.muted,weight:s.tampered.has(i)?700:500});});}}
          if(n.dup)g+=t(x,y+h/2+26,'copy',{size:10,anchor:'middle',fill:C.muted});
          g+='</g>';}));
        const focus=s.mode==='prove'?[s.selected]:[...s.tampered].sort((a,b)=>a-b);
        const cap=compact&&focus.length?focus.slice(0,2).map(i=>`tx${i+1}: ${now[i]}`).join('   ·   ')+(focus.length>2?'  …':''):(s.mode==='tamper'?'Click a leaf to change its data.':'Click a leaf to build its inclusion proof.');
        g+=t(20,574,cap,{size:12,weight:600,fill:compact&&focus.length?(s.mode==='prove'?C.purple:C.red):C.muted});
        scene.innerHTML=svg(960,590,g,'Merkle tree of the selected leaves');
        const k=proofSize(s.n),kb=proofSize(s.big);
        status.textContent=`${s.n} leaves · ${depth} levels · root ${P.hex(lv.at(-1)[0].hash).slice(0,8)}…`;
        controls.querySelector('#hint').textContent=s.tampered.size?`${s.tampered.size} leaf${s.tampered.size>1?'s':''} tampered`:'';
        if(s.mode==='tamper'){
          const changedCount=lv.reduce((a,row,d)=>a+row.filter((n,i)=>P.hex(n.hash)!==P.hex((orig[d][i]||{}).hash||new Uint8Array())&&!n.dup).length,0);
          aside.innerHTML=K.asideBlock({title:s.tampered.size?'One edit, a whole path of new hashes.':'Every leaf is committed by one root.',text:s.tampered.size?`Changing one character changes its hash completely, then every parent above it, up to the root. ${changedCount} hashes changed. The header still holds the old root, so the edit is detected — and fixing the header would require redoing the proof of work.`:'The root is a 32-byte fingerprint of all the leaves in order. It sits in the 80-byte block header, so the proof of work covers every transaction without the header growing.',
            takeaway:'A Merkle root commits to the exact data and order: any change is visible at the top.',
            stats:K.readouts([['Leaves',fmt(s.n)],['Levels',fmt(depth)],['Hashes changed',s.tampered.size?fmt(changedCount):'0',s.tampered.size?'bad':''],['Root matches header',tamperedRoot?'no':'yes',tamperedRoot?'bad':'good']]),
            tries:['Tamper with one leaf. Count the red boxes.','Tamper with a leaf, then tamper with it again (click twice).','Set 5 leaves. Where does the dashed copy come from?','Switch to sensor records: the same tree anchors device data.']});
        }else{
          const ok=verify(lv[0][s.selected].hash,proof(lv,s.selected),lv.at(-1)[0].hash);
          aside.innerHTML=K.asideBlock({title:`Proving one leaf takes ${k} hash${k===1?'':'es'}.`,text:`To show that “${esc(now[s.selected])}” is in the tree, send only the orange sibling hashes. The verifier hashes upward along the purple path and compares the result with the root it already trusts.`,
            takeaway:'Proof size grows with log₂ of the number of leaves: doubling the batch adds one hash.',
            stats:K.readouts([['Proof here',`${k} × 32 B = ${k*32} B`,'accent'],['All leaf hashes',`${s.n} × 32 B = ${s.n*32} B`],[`Proof for ${group(s.big)} leaves`,`${kb} hashes (${kb*32} B)`,'wide'],['Verifies against root',ok?'yes':'no',ok?'good':'bad']]),
            tries:['Prove different leaves: the number of orange hashes stays the same.','Raise the “real batch” slider to 1,000,000. How big is the proof?','Tamper with a leaf in tamper mode, then prove it: which root would it match?']});
        }
      }
      draw();
      this.state=()=>({...s,tampered:[...s.tampered]});
    }});
})(typeof window!=='undefined'?window:globalThis);

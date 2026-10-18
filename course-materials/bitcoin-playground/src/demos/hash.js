/* Tool · Hash avalanche, leading-zero puzzle and birthday collisions, with real SHA-256. */
(function(root){
  'use strict';
  const P=root.PlaygroundProtocol||(typeof require!=='undefined'?require('../protocol.js'):null);
  const enc=s=>new TextEncoder().encode(s);
  const sha=s=>P.sha256(enc(s)),sha2=s=>P.sha256(P.sha256(enc(s)));
  const bits=bytes=>Array.from(bytes,b=>b.toString(2).padStart(8,'0')).join('');
  const diffBits=(a,b)=>{let d=0;for(let i=0;i<a.length;i++){let x=a[i]^b[i];while(x){d+=x&1;x>>=1;}}return d;};
  const leadingZeros=bytes=>{let z=0;for(const b of bytes){if(b===0){z+=8;continue;}z+=Math.clz32(b)-24;break;}return z;};
  /* Change one character: shift the last character's code by one. */
  const tweak=s=>s.length?s.slice(0,-1)+String.fromCharCode(s.charCodeAt(s.length-1)+1):'a';
  /* Proof-of-work style search: append nonce, double SHA-256, until k leading zero bits. Resumable in slices. */
  function search(text,k,from=0,budget=Infinity){for(let n=from;n<from+budget;n++){const h=sha2(`${text}|${n}`);if(leadingZeros(h)>=k)return {found:true,nonce:n,tries:n+1,hash:h};}return {found:false,next:from+budget};}
  /* Birthday search on the first k bits of SHA-256. */
  function birthday(prefix,k,max=1<<22){const seen=new Map(),mask=k;for(let i=0;i<max;i++){const h=sha(`${prefix}${i}`),key=bits(h.slice(0,Math.ceil(mask/8))).slice(0,mask);if(seen.has(key))return {i:seen.get(key),j:i,tries:i+1,key};seen.set(key,i);}return null;}
  const birthdayExpected=k=>Math.sqrt(Math.PI/2*2**k);
  const model={sha,sha2,bits,diffBits,leadingZeros,tweak,search,birthday,birthdayExpected};
  if(typeof module!=='undefined'&&module.exports){module.exports=model;return;}

  const K=root.PlaygroundKit,{t,svg,colors:C,fmt,sci,esc}=K;
  K.register({id:'hash-avalanche',number:'05',module:'M 2.0',moduleName:'Cryptographic foundations',kind:'Hash functions',color:C.purple,
    title:'Hash avalanche and puzzles',
    description:'Change one letter and half of the 256 output bits flip. Then hunt for hashes starting with zeros, and find collisions on short hashes to see why 256 bits are needed.',
    preview(){let g='';for(let r=0;r<10;r++)for(let c=0;c<16;c++){const on=((r*7+c*13)%5)<2,ch=((r*11+c*5)%7)<3;g+=`<rect x="${20+c*9}" y="${20+r*13}" width="8" height="12" rx="1.5" fill="${ch?'#db901e':on?'#8256d8':'#e9e5da'}"/>`;}g+=`<text x="190" y="70" font-size="15" font-family="Menlo,monospace" fill="#29323c">0000 3fa9…</text><text x="190" y="100" font-size="15" font-family="Menlo,monospace" fill="#8f897c">nonce 4,127</text>`;return `<svg viewBox="0 0 320 168">${g}</svg>`;},
    mount(main,{reduced}){
      const s={view:'avalanche',text:'Alice pays Bob 10 BTC',prev:null,hist:null,k:12,mine:null,batch:null,bk:24,bday:null};
      s.prev=tweak(s.text);let stopAnim=null;
      main.innerHTML=K.page(this,{tabs:K.tabs('view',[{value:'avalanche',label:'1 · Avalanche'},{value:'puzzle',label:'2 · Leading-zero puzzle'},{value:'birthday',label:'3 · Birthday collisions'}],s.view),
        notes:`<ul><li><strong>Real hashing.</strong> All hashes here are real SHA-256 (the puzzle uses double SHA-256, as Bitcoin does), computed in the page.</li><li><strong>Avalanche.</strong> Each output bit flips with probability about ½ when the input changes, so the number of changed bits follows a binomial distribution around 128 — the output reveals nothing about how similar the inputs were.</li><li><strong>Puzzle.</strong> Requiring k leading zero bits succeeds with probability 2⁻ᵏ per try, so the expected number of tries is 2ᵏ and the count is geometrically distributed: there is no progress, only luck per try. Bitcoin compares the whole hash with a numeric target rather than counting zeros, and the target is enormously harder.</li><li><strong>Birthday bound.</strong> Finding any two inputs with the same k-bit output takes about √(π/2 · 2ᵏ) ≈ 1.25 · 2^(k/2) tries, far fewer than the 2ᵏ needed to match a given hash. That is why a 256-bit hash gives about 128 bits of collision resistance.</li><li>The page's SHA-256 is plain JavaScript (tens of thousands of hashes per second). Bitcoin mining hardware performs above 10²⁰ per second across the network.</li></ul>`});
      const scene=main.querySelector('#scene'),controls=main.querySelector('#controls'),aside=main.querySelector('#aside'),layer=main.querySelector('#layer'),status=main.querySelector('#scene-status');
      function stop(){if(stopAnim){stopAnim();stopAnim=null;}}
      const textInput=()=>`<label class="ctl" style="grid-column:1/-1"><span class="ctl-top"><span class="ctl-label">Input text</span></span><input type="text" id="txt" value="${esc(s.text)}" maxlength="80" style="font:15px Menlo,Consolas,monospace;padding:9px 11px;border:1px solid var(--line);border-radius:8px;background:#fffdf7;color:var(--ink)"></label>`;
      function build(){stop();
        if(s.view==='avalanche')controls.innerHTML=textInput()+`<div class="demo-actions"><button class="primary" id="tweak">Change one character</button><button id="many">Try 300 one-character changes</button><span class="spacer"></span><span class="note">Compared with the previous input</span></div>`;
        if(s.view==='puzzle')controls.innerHTML=textInput()+K.slider({key:'k',label:'Required leading zero bits',min:1,max:20,value:s.k,format:v=>`${v} bits`,hint:'Each extra bit doubles the expected work'})+`<div class="demo-actions"><button class="primary" id="mine">▶ &nbsp; Search for a nonce</button><button id="batch">Repeat 40 searches</button><span class="note" id="pnote"></span></div>`;
        if(s.view==='birthday')controls.innerHTML=K.slider({key:'bk',label:'Hash truncated to',min:8,max:32,step:2,value:s.bk,format:v=>`${v} bits`})+`<div class="demo-actions"><button class="primary" id="bday">▶ &nbsp; Find a collision</button><span class="note" id="bnote"></span></div>`;
        K.bindControls(controls,s,{k:{format:v=>`${v} bits`},bk:{format:v=>`${v} bits`}},()=>{stop();s.mine=null;s.batch=null;s.bday=null;draw();});
        const q=id=>controls.querySelector('#'+id),txt=q('txt');
        if(txt)txt.addEventListener('input',()=>{if(s.view==='avalanche')s.prev=s.text;s.text=txt.value;s.mine=null;s.batch=null;s.hist=null;stop();draw();});
        if(q('tweak'))q('tweak').onclick=()=>{s.prev=s.text;s.text=tweak(s.text);txt.value=s.text;draw();};
        if(q('many'))q('many').onclick=()=>{const h=new Array(257).fill(0);let x=s.text;for(let i=0;i<300;i++){const y=x+String.fromCharCode(33+(i%90))+i;h[diffBits(sha(x+i),sha(y))]++;}s.hist=h;draw();};
        if(q('mine'))q('mine').onclick=()=>{stop();s.batch=null;s.mine={next:0,found:false,tries:0,started:performance.now()};
          stopAnim=K.loop(()=>{const r=search(s.text,s.k,s.mine.next,reduced?1e9:Math.max(40,Math.min(3000,2**s.k/60)));if(r.found){s.mine={...r,found:true,ms:performance.now()-s.mine.started};draw();stopAnim=null;return false;}s.mine.next=r.next;s.mine.tries=r.next;s.mine.last=sha2(`${s.text}|${r.next-1}`);draw();});};
        if(q('batch'))q('batch').onclick=()=>{stop();s.mine=null;s.batch={runs:[],k:s.k};let cur={next:0};
          stopAnim=K.loop(()=>{const t0=performance.now();while(performance.now()-t0<25){const r=search(`${s.text}#${s.batch.runs.length}`,s.batch.k,cur.next,2000);if(r.found){s.batch.runs.push(r.tries);cur={next:0};if(s.batch.runs.length>=40){draw();stopAnim=null;return false;}}else cur.next=r.next;}draw();});};
        if(q('bday'))q('bday').onclick=()=>{stop();s.bday={pending:true};draw();setTimeout(()=>{s.bday=birthday(`msg-${s.bk}-`,s.bk);draw();},20);};
      }
      function grid(x,y,bytes,ref,cell=12){const b=bits(bytes),r=ref?bits(ref):null;let g='';for(let i=0;i<256;i++){const X=x+(i%16)*cell,Y=y+Math.floor(i/16)*cell,ch=r&&b[i]!==r[i];g+=`<rect x="${X}" y="${Y}" width="${cell-1.5}" height="${cell-1.5}" rx="1.5" fill="${ch?C.orange:b[i]==='1'?C.purple:'#e9e5da'}"/>`;}return g;}
      function hexLine(x,y,h,ref,size=12.5){const a=P.hex(h),r=ref?P.hex(ref):a;let g='';for(let row=0;row<2;row++){g+=`<text x="${x}" y="${y+row*K.fs(size)*1.35}" style="font-size:${K.fs(size)}px" class="mono">`;for(let i=row*32;i<row*32+32;i++)g+=`<tspan fill="${a[i]!==r[i]?C.orange:C.ink}">${a[i]}</tspan>`;g+='</text>';}return g;}
      function drawAvalanche(){
        const h0=sha(s.prev),h1=sha(s.text),d=diffBits(h0,h1);let g='';
        const q=x=>`“${x.slice(0,40)}${x.length>40?'…':''}”`;
        g+=t(30,36,'BEFORE',{size:12,weight:700,fill:C.muted})+t(130,36,q(s.prev),{size:13,cls:'mono'});
        g+=t(30,72,'AFTER',{size:12,weight:700,fill:C.muted})+t(130,72,q(s.text),{size:13,cls:'mono'});
        g+=t(30,112,'before',{size:11,fill:C.muted})+grid(30,124,h0,null,14)+t(290,112,'after (changed bits in orange)',{size:11,fill:C.muted})+grid(290,124,h1,h0,14);
        g+=hexLine(30,390,h1,h0,13)+t(30,466,`${d} of 256 bits changed (orange)`,{size:16,weight:700,fill:C.orange});
        if(s.hist){const vals=s.hist.slice(96,161);g+=t(580,112,'BITS CHANGED',{size:12,weight:700,fill:C.muted})+t(580,138,'300 one-character edits',{size:11,fill:C.muted});g+=K.bars({x:600,y:156,w:330,h:220,values:vals,colors:C.orange,labels:vals.map((v,i)=>(i+96)%16===0?String(i+96):''),gap:0.1});const lx=600+(128-96+0.5)/65*330;g+=`<line x1="${lx}" x2="${lx}" y1="150" y2="378" stroke="${C.ink}" stroke-dasharray="4 4"/>`+t(lx+6,172,'128',{size:11,weight:700,cls:'halo'});}
        else ['Press “Try 300 one-character','changes” to see the spread','of flipped bits.'].forEach((l,i)=>{g+=t(580,200+i*30,l,{size:13,fill:C.muted});});
        scene.innerHTML=svg(960,490,g,'SHA-256 output bits before and after a small change');layer.textContent='SHA-256 · avalanche effect';status.textContent=`${s.text.length} characters in → 256 bits out`;
        aside.innerHTML=K.asideBlock({title:`A tiny edit flipped ${d} bits.`,text:'The two inputs differ by one character, yet the outputs look unrelated. You cannot steer the output by nudging the input, and similar inputs do not give similar hashes.',
          takeaway:'A hash is a fingerprint: same input, same output; any change, a completely different output.',
          stats:K.readouts([['Bits changed',`${d} / 256`,'accent'],['Expected',`≈ 128 ± 8`],['Output size','256 bits'],['Input size',`${enc(s.text).length} bytes`]]),
          tries:['Press “Change one character” several times.','Type a long paragraph: the output is still 256 bits.','Run 300 edits: where does the histogram peak?']});
      }
      function drawPuzzle(){
        let g='';const k=s.k,exp=2**k;
        if(s.mine){const h=s.mine.found?s.mine.hash:s.mine.last;if(h){const b=bits(h);g+=t(30,36,s.mine.found?`FOUND · nonce ${fmt(s.mine.nonce)}`:`SEARCHING · nonce ${fmt(s.mine.tries)}`,{size:13,weight:700,fill:s.mine.found?C.green:C.muted});
          for(let i=0;i<64;i++){const X=30+(i%32)*28,Y=58+Math.floor(i/32)*38;g+=`<rect x="${X}" y="${Y}" width="25" height="32" rx="3" fill="${i<k?(b[i]==='0'?C.green:C.red):b[i]==='1'?'#cdbdf0':'#efeadf'}"/>`+t(X+12.5,Y+23,b[i],{size:11,anchor:'middle',cls:'mono',fill:i<k?'#fff':C.ink});}
          g+=t(30,164,`first 64 of 256 bits of SHA-256d(“${s.text.slice(0,24)}${s.text.length>24?'…':''}|${fmt(s.mine.found?s.mine.nonce:s.mine.tries)}”)`,{size:11.5,fill:C.muted})+t(30,192,`the first ${k} must be 0 (green)`,{size:11.5,fill:C.muted});
          const frac=Math.min(1,(s.mine.found?s.mine.tries:s.mine.tries)/(exp*3));g+=`<rect x="30" y="214" width="540" height="24" rx="4" fill="#efeadf"/><rect x="30" y="214" width="${540*frac}" height="24" rx="4" fill="${s.mine.found?C.green:C.purple}"/><line x1="${30+540/3}" x2="${30+540/3}" y1="208" y2="244" stroke="${C.ink}" stroke-width="2"/>`+t(30+540/3,270,`expected 2^${k} = ${fmt(exp)}`,{size:12,anchor:'middle',weight:700})+t(570,270,'3×',{size:11,anchor:'end',fill:C.muted});
          if(s.mine.found)g+=t(30,316,`${fmt(s.mine.tries)} tries in ${fmt(s.mine.ms/1000,2)} s — ${s.mine.tries<exp?'lucky':'unlucky'}: ${fmt(s.mine.tries/exp,2)}× the expectation`,{size:15,weight:700});}}
        else g+=t(30,60,'Press “Search for a nonce”: the page tries nonce 0, 1, 2, …',{size:14,fill:C.muted});
        if(s.batch){const runs=s.batch.runs,mx=Math.max(exp*4,...runs),bins=16,h=new Array(bins).fill(0);runs.forEach(r=>h[Math.min(bins-1,Math.floor(r/mx*bins))]++);
          const by0=s.mine?370:120;g+=t(30,by0,`TRIES NEEDED · ${runs.length}/40 searches at ${s.batch.k} bits`,{size:12,weight:700,fill:C.muted});g+=K.bars({x:110,y:by0+20,w:500,h:180,values:h,colors:C.purple,labels:h.map((_,i)=>i%4===0?K.sci(i*mx/bins,0).replace('.0',''):''),gap:0.12});
          const mean=runs.length?runs.reduce((a,b)=>a+b,0)/runs.length:0;g+=t(650,by0+60,`average ${fmt(mean)}`,{size:13,weight:700})+t(650,by0+92,`expected ${fmt(2**s.batch.k)}`,{size:13,weight:700})+t(650,by0+134,'Most searches are short;',{size:12,fill:C.muted})+t(650,by0+162,'a few are very long.',{size:12,fill:C.muted});}
        const rate=s.mine&&s.mine.found&&s.mine.ms>0?s.mine.tries/(s.mine.ms/1000):5e4;
        scene.innerHTML=svg(960,s.batch?(s.mine?625:375):(s.mine?340:120),g,'Leading-zero hash puzzle search');layer.textContent='Proof-of-work style puzzle · double SHA-256';status.textContent=`k = ${k} bits · expected ${fmt(exp)} tries`;
        controls.querySelector('#pnote').textContent=s.mine&&s.mine.found?`${fmt(s.mine.tries)} tries`:'';
        aside.innerHTML=K.asideBlock({title:'No shortcut: just try, try, try.',text:`Each try has a 1 in ${fmt(exp)} chance. Previous failures do not bring success closer — the search is memoryless, which is what makes mining a fair lottery proportional to hashrate.`,
          takeaway:'Proof of work is easy to verify (one hash) and costly to produce (about 2ᵏ hashes).',
          stats:K.readouts([['Expected tries',fmt(exp),'accent'],['Verifying','1 hash','good'],['This page’s speed',`≈ ${fmt(rate,0)} /s`],['One Bitcoin block (~10²³–10²⁴ hashes) at this speed',`≈ ${sci(6e23/rate/3.15576e7,1)} years`,'wide bad']]),
          tries:['Search at 8, 12 and 16 bits. Does the time double per bit?','Repeat 40 searches at 10 bits: why is the histogram so skewed?','Change the input text and search again: is the nonce predictable?']});
      }
      function drawBirthday(){
        const k=s.bk,b=s.bday;let g='';
        g+=t(30,36,`SHA-256 TRUNCATED TO ${k} BITS · ${fmt(2**k)} possible values`,{size:12,weight:700,fill:C.muted});
        if(b&&!b.pending){g+=t(30,82,`“msg-${k}-${b.i}”`,{size:16,cls:'mono'})+t(30,118,`“msg-${k}-${b.j}”`,{size:16,cls:'mono'})+t(30,160,'both start with',{size:13,fill:C.muted})+t(220,160,b.key.replace(/(.{8})/g,'$1 ').trim(),{size:14,cls:'mono',weight:700,fill:C.orange});
          g+=t(30,212,`Collision after ${fmt(b.tries)} hashes`,{size:18,weight:700,fill:C.green});}
        else if(b&&b.pending)g+=t(30,82,'Searching …',{size:14,fill:C.muted});else g+=t(30,82,'Press “Find a collision”: hash msg-0, msg-1, …',{size:14,fill:C.muted})+t(30,114,'until two messages share the first k bits.',{size:14,fill:C.muted});
        const pts1=[],pts2=[];for(let x=8;x<=256;x+=2){pts1.push([x,birthdayExpected(x)]);pts2.push([x,2**x]);}
        g+=K.plot({x:110,y:262,w:780,h:170,xr:[8,256],yr:[1,1e80],ylog:true,yticks:[1,1e20,1e40,1e60,1e80],yfmt:v=>v===1?'1':'10'+K.sup(Math.round(Math.log10(v))),xticks:[8,64,128,160,256],xfmt:String,xlabel:'hash length (bits)',ylabel:'tries',series:[{pts:pts2,color:C.red,width:2,dash:'5 4'},{pts:pts1,color:C.purple,width:2.6}],dots:[{x:k,y:birthdayExpected(k),color:'#f3bc59',label:'you'},{x:256,y:birthdayExpected(256),color:C.purple,label:'SHA-256 ≈ 2¹²⁸',anchor:'end'}]});
        g+=t(110,528,'solid: find any collision (≈ 2^(k/2)) · dashed: match a given hash (2^k)',{size:11,fill:C.muted});
        scene.innerHTML=svg(960,548,g,'Birthday collision search on truncated hashes');layer.textContent='Collision resistance · birthday bound';status.textContent=`expected ≈ ${fmt(birthdayExpected(k))} tries`;
        controls.querySelector('#bnote').textContent=b&&!b.pending?`expected ≈ ${fmt(birthdayExpected(k))}`:'';
        aside.innerHTML=K.asideBlock({title:'Collisions come much sooner than you think.',text:`Like 23 people sharing a birthday with 50% chance, a ${k}-bit hash collides after about ${fmt(birthdayExpected(k))} tries — not ${fmt(2**k)}. Every new hash can match any earlier one.`,
          takeaway:'A 256-bit hash offers about 128 bits of collision resistance: still far out of reach.',
          stats:K.readouts([['Possible outputs',sci(2**k,1)],['Expected tries',fmt(birthdayExpected(k)),'accent'],['Found after',b&&!b.pending?fmt(b.tries):'—']]),
          tries:['Find a collision at 16, 24 and 32 bits.','Each +2 bits: roughly how much longer does it take?','Why would a 64-bit hash be unsafe for txids?']});
      }
      function draw(){if(s.view==='avalanche')drawAvalanche();else if(s.view==='puzzle')drawPuzzle();else drawBirthday();}
      main.querySelectorAll('.demo-tab').forEach(b=>b.addEventListener('click',()=>{s.view=b.dataset.value;main.querySelectorAll('.demo-tab').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));build();draw();}));
      build();draw();
      this.state=()=>({view:s.view,text:s.text,k:s.k,mine:s.mine&&s.mine.found?{nonce:s.mine.nonce}:null,batch:s.batch?s.batch.runs.length:0,bday:s.bday&&!s.bday.pending?s.bday.tries:null});
      return stop;
    }});
})(typeof window!=='undefined'?window:globalThis);

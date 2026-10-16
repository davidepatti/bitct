/* Tool · Seed phrase and HD key tree. Toy words and toy identifiers: never real keys. */
(function(root){
  'use strict';
  const P=root.PlaygroundProtocol||(typeof require!=='undefined'?require('../protocol.js'):null);
  const id=s=>P.hex(P.sha256(new TextEncoder().encode(s))).slice(0,6);
  /* BIP39 sizes: 12 words = 128 bits entropy + 4 checksum bits; 24 words = 256 + 8. 2048-word list. */
  const SIZES={12:{entropy:128,checksum:4},24:{entropy:256,checksum:8}};
  /* Expected guesses (half the space) to recover a phrase with `missing` unknown words at known positions,
     after the checksum filter, plus optional passphrase bits. Returned as log2. */
  function searchBits(words,missing,passBits=0){const sz=SIZES[words];if(missing<=0)return passBits?passBits-1:0;const raw=Math.min(missing*11,sz.entropy+sz.checksum);const afterChecksum=missing*11>=sz.checksum?raw-sz.checksum:raw;return Math.max(0,Math.min(afterChecksum,sz.entropy))+passBits-1;}
  /* HD tree for a BIP84-style account: m/84'/0'/0'/{0,1}/i */
  function tree(seedId,count=4){
    const nodes=[],add=(path,parent,hardened,level)=>{const n={path,parent,hardened,level,id:id(seedId+'|'+path)};nodes.push(n);return n;};
    const m=add('m',null,false,0),p=add("m/84'",m.path,true,1),c=add("m/84'/0'",p.path,true,2),a=add("m/84'/0'/0'",c.path,true,3);
    for(const ch of [0,1]){const cn=add(`${a.path}/${ch}`,a.path,false,4);for(let i=0;i<count;i++)add(`${cn.path}/${i}`,cn.path,false,5);}
    return nodes;
  }
  /* Who can derive what. xpub of the account gives all non-hardened public keys below it.
     xpub + any non-hardened descendant private key reveals the account private key (and so every key below it). */
  function access(nodes,{watch=false,leakXpub=false,leakChild=false}){
    const below=n=>n.level>=4,out={};
    const attackerSpendsAll=leakXpub&&leakChild;
    for(const n of nodes){out[n.path]={owner:'private',watch:watch&&below(n)?'public':watch&&n.level===3?'xpub':null,
      attacker:attackerSpendsAll&&n.level>=3?'private':leakChild&&n.path.endsWith('/0/2')?'private':leakXpub&&n.level>=3?'public':null};}
    return out;
  }
  const model={SIZES,searchBits,tree,access,id};
  if(typeof module!=='undefined'&&module.exports){module.exports=model;return;}

  const K=root.PlaygroundKit,{t,svg,colors:C,fmt,sci,duration}=K;
  const TOY=['amber','basil','cedar','delta','ember','fable','glade','harbor','island','jasper','kettle','lantern','meadow','nectar','orbit','pebble','quarry','raven','saddle','timber','umber','velvet','willow','yonder','zephyr','acorn','brook','canyon','dune','echo','fjord','granite','hollow','ivory','juniper','kelp','lagoon','marble','nimbus','oasis','prairie','quill','ridge','summit','thistle','upland','valley','walnut'];
  const PASS={none:{label:'No passphrase',bits:0},weak:{label:'One common word',bits:15},strong:{label:'Strong passphrase',bits:60}};
  K.register({id:'seed-hd-tree',number:'18',module:'M 3.1',moduleName:'Key management and security',kind:'Seeds and HD wallets',color:C.green,
    title:'Seed phrase and HD key tree',
    description:'One list of words regenerates every key in a wallet. See how much a missing word or a passphrase costs an attacker, and what a watch-only xpub reveals — or leaks.',
    preview(){let g='';for(let i=0;i<6;i++)g+=`<rect x="${14+(i%3)*42}" y="${40+Math.floor(i/3)*30}" width="38" height="22" rx="4" fill="${i===4?'#f6d6d3':'#e3f1e5'}" stroke="#29323c" stroke-width="1"/>`;g+='<path d="M150 84H180" stroke="#29323c" stroke-width="1.5"/><circle cx="190" cy="84" r="8" fill="#47965d"/>';[44,70,98,124].forEach((y,i)=>{g+=`<path d="M198 84L250 ${y}" stroke="#a49c8c"/><circle cx="258" cy="${y}" r="7" fill="${i===2?'#ce5750':'#bfdaef'}" stroke="#29323c"/>`;});return `<svg viewBox="0 0 320 168">${g}</svg>`;},
    mount(main){
      const s={view:'backup',words:12,known:10,pass:'none',rate:1e9,watch:true,leakXpub:false,leakChild:false,typo:false};
      const specs={known:{format:v=>`${v} of ${s.words}`},rate:{format:v=>`${sci(v,0)} guesses/s`}};
      main.innerHTML=K.page(this,{tabs:K.tabs('view',[{value:'backup',label:'1 · Backup strength'},{value:'tree',label:'2 · Key tree and watch-only'}],s.view),
        notes:`<ul><li><strong>Toy material.</strong> The words come from a small made-up list and the identifiers are shortened hashes of labels. Nothing here is a valid BIP39 phrase or a usable key; do not use it for real funds.</li><li><strong>BIP39.</strong> A 12-word phrase encodes 128 bits of randomness plus a 4-bit checksum (24 words: 256 + 8) using a 2,048-word list, 11 bits per word. Seed derivation runs PBKDF2 with 2,048 rounds, which slows each guess. An optional passphrase (sometimes called the 25th word) creates a completely different wallet from the same words.</li><li><strong>Brute force.</strong> The estimate assumes the attacker knows the positions of the missing words and checks guesses at the chosen rate; the checksum discards most wrong guesses before the expensive step. Times are expected values (half the search space).</li><li><strong>BIP32.</strong> Keys form a tree. Hardened steps (marked ′) cannot be derived from public information. An account's extended public key (xpub) lets a watch-only wallet compute every receive and change address below it, but no private keys. However, an xpub plus any one non-hardened child private key lets anyone compute the account's private key — so a leaked xpub turns a single leaked key into a total loss.</li></ul>`});
      const scene=main.querySelector('#scene'),controls=main.querySelector('#controls'),aside=main.querySelector('#aside'),layer=main.querySelector('#layer'),status=main.querySelector('#scene-status');
      function build(){
        if(s.view==='backup')controls.innerHTML=K.segmented({key:'words',label:'Phrase length',options:[{value:12,label:'12 words'},{value:24,label:'24 words'}],value:s.words})+K.slider({key:'known',label:'Words the attacker has (e.g. a torn backup)',min:0,max:s.words,value:Math.min(s.known,s.words),format:specs.known.format})+K.segmented({key:'pass',label:'Passphrase',options:Object.entries(PASS).map(([k,v])=>({value:k,label:v.label})),value:s.pass})+K.slider({key:'rate',label:'Attacker speed',min:1e3,max:1e13,log:true,value:s.rate,format:specs.rate.format});
        else controls.innerHTML=`<div class="demo-actions"><button data-tog="watch" aria-pressed="${s.watch}">👁 Watch-only server has the account xpub</button><button data-tog="leakXpub" aria-pressed="${s.leakXpub}">Attacker steals the xpub</button><button data-tog="leakChild" aria-pressed="${s.leakChild}">Attacker steals one child key (…/0/2)</button><button data-tog="typo" aria-pressed="${s.typo}">Restore with a passphrase typo</button></div>`;
        K.bindControls(controls,s,specs,key=>{if(key==='words'){s.known=Math.min(s.known,s.words);build();}draw();});
        controls.querySelectorAll('[data-tog]').forEach(b=>b.onclick=()=>{s[b.dataset.tog]=!s[b.dataset.tog];b.setAttribute('aria-pressed',String(s[b.dataset.tog]));draw();});
      }
      function drawBackup(){
        const N=s.words,missing=N-s.known,pb=PASS[s.pass].bits,lb=searchBits(N,missing,pb),secs=2**lb/s.rate;let g='';
        g+=t(30,30,`YOUR ${N}-WORD BACKUP (toy words)`,{size:12,weight:700,fill:C.muted});
        const cols=N===12?4:6;for(let i=0;i<N;i++){const X=30+(i%cols)*(N===12?110:74),Y=48+Math.floor(i/cols)*38,known=i<s.known,w=N===12?100:66;g+=`<rect x="${X}" y="${Y}" width="${w}" height="30" rx="6" fill="${known?'#f6d6d3':'#e3f1e5'}" stroke="${known?C.red:'#29323c'}" stroke-width="1.3"/>`+t(X+8,Y+20,`${i+1}`,{size:10,fill:C.muted})+t(X+w/2+6,Y+20,known?TOY[(i*7+3)%TOY.length]:'?',{size:N===12?13:11.5,anchor:'middle',weight:known?700:500,fill:known?'#a3332d':C.ink});}
        g+=t(30,48+Math.ceil(N/cols)*38+16,`red: words the attacker has · green: words still secret (${missing})`,{size:12,fill:C.muted});
        /* chart: time vs missing words */
        const pts=[],ptsP=[];for(let m=0;m<=N;m++){pts.push([m,Math.max(1e-6,2**searchBits(N,m,0)/s.rate)]);ptsP.push([m,Math.max(1e-6,2**searchBits(N,m,pb||60)/s.rate)]);}
        const yr=[1e-6,1e70];g+=t(500,30,'Expected time to brute-force (seconds, log scale)',{size:12,weight:700,fill:C.muted});
        g+=K.plot({x:540,y:48,w:380,h:280,xr:[0,N],yr,ylog:true,yticks:[1e-6,1,3.15e7,1e30,1e50,1e70],yfmt:v=>v===1?'1 s':v===3.15e7?'1 year':v<1?'1 µs':'10'+K.sup(Math.round(Math.log10(v)))+' s',xticks:N===12?[0,2,4,6,8,10,12]:[0,4,8,12,16,20,24],xfmt:String,xlabel:'missing words',
          series:[{pts,color:C.green,width:2.6},...(pb?[{pts:ptsP,color:C.purple,width:2.2,dash:'5 4'}]:[])],hlines:[{y:3.15e7,color:C.muted,dash:'2 4'},{y:4.3e17,color:C.red,dash:'2 4',label:'age of the universe'}],dots:[{x:missing,y:Math.max(1e-6,secs),color:C.ink,label:K.duration(secs/60)}]});
        if(pb)g+=t(540,372,`dashed: with the ${PASS[s.pass].label.toLowerCase()}`,{size:11,fill:C.purple});
        scene.innerHTML=svg(960,400,g,'Seed phrase backup and brute-force time');layer.textContent='BIP39 backup · brute-force cost';status.textContent=`${N} words · ${SIZES[N].entropy} bits of entropy`;
        aside.innerHTML=K.asideBlock({title:missing===0&&!pb?'A complete phrase is the wallet.':secs<86400*30?'This backup can be cracked.':secs<3.15e9?'Hard, but within reach of a determined attacker.':'Out of reach.',
          text:missing===0?(pb?'The attacker has every word, but the passphrase still has to be guessed — and it adds a second, independent wallet.':'Whoever holds all the words can recreate every key and spend everything. No password, no recovery service.'):`${missing} unknown word${missing===1?'':'s'} × 11 bits ${missing*11>SIZES[N].entropy?'exceeds the entropy':`= ${missing*11} bits`}${pb?` plus ${pb} passphrase bits`:''}, minus the checksum: about 2^${Math.round(lb+1)} candidates.`,
          takeaway:'Protect the words like the coins themselves: every key is derived from them.',
          stats:K.readouts([['Secret words',`${missing} of ${N}`],['Search space',`≈ 2^${Math.round(lb+1)}`,'accent'],['Expected time',K.duration(secs/60),secs<3.15e9?'bad':'good'],['Passphrase bits',pb?`+${pb}`:'none']]),
          tries:['Give the attacker 11 of 12 words. How long does the last one take?','Now hide 3 words: does that help?','Add a strong passphrase with all 12 words known.','Speed the attacker up to 10¹³/s: is a full 12-word phrase still safe?']});
      }
      function drawTree(){
        const seedId=s.typo?'alice-seed+typo':'alice-seed',nodes=tree(seedId),acc=access(nodes,s);let g='';
        const X=lv=>[40,170,300,430,590,760][lv],kids={};nodes.forEach(n=>{if(n.parent)(kids[n.parent]=kids[n.parent]||[]).push(n);});
        const leaves=nodes.filter(n=>n.level===5),Y={};leaves.forEach((n,i)=>{Y[n.path]=62+i*46+(i>=4?20:0);});
        [4,3,2,1,0].forEach(lv=>nodes.filter(n=>n.level===lv).forEach(n=>{const ks=kids[n.path]||[];Y[n.path]=ks.length?ks.reduce((a,k)=>a+Y[k.path],0)/ks.length:250;}));
        nodes.forEach(n=>{if(n.parent){const px=X(nodes.find(p=>p.path===n.parent).level)+120,py=Y[n.parent];g+=`<path d="M${px} ${py}C${px+20} ${py} ${X(n.level)-20} ${Y[n.path]} ${X(n.level)} ${Y[n.path]}" fill="none" stroke="${n.hardened?'#8f897c':'#bdb6a6'}" stroke-width="${n.hardened?2:1.2}" ${n.hardened?'':'stroke-dasharray="4 3"'}/>`;}});
        nodes.forEach(n=>{const a=acc[n.path],x=X(n.level),y=Y[n.path],atk=a.attacker,fill=atk==='private'?'#f6d6d3':atk==='public'?'#fbe6c4':a.watch?'#dbe9f6':'#e3f1e5';
          g+=`<rect x="${x}" y="${y-17}" width="120" height="34" rx="7" fill="${fill}" stroke="${atk==='private'?C.red:'#29323c'}" stroke-width="${atk==='private'?2.4:1.2}"/>`;
          const label=n.path==='m'?'master m':n.path.replace("m/84'/0'/0'",'…acct').replace("m/84'/0'",'…coin').replace("m/84'",'purpose 84′').replace(/'/g,'′');
          g+=t(x+8,y-3,n.level===5?n.path.split('/').slice(-2).join('/'):label,{size:11,weight:700})+t(x+8,y+11,`id ${n.id}`,{size:10,cls:'mono',fill:C.muted});
          const badges=(atk==='private'?'💀':'')+(atk==='public'?'👀':'')+(a.watch?'👁':'');if(badges)g+=t(x+114,y+5,badges,{size:12,anchor:'end'});});
        g+=`<rect x="0" y="${Y.m-26}" width="30" height="52" rx="6" fill="#e3f1e5" stroke="#29323c"/>`+t(15,Y.m+4,'🌱',{size:16,anchor:'middle'});
        g+=t(590,30,'receive (…/0/i)  ·  change (…/1/i)',{size:12,weight:700,fill:C.muted})+t(40,30,'SEED → hardened path → account',{size:12,weight:700,fill:C.muted});
        g+=t(40,480,'solid: hardened step (needs the private parent) · dashed: normal step (public parent suffices)',{size:11,fill:C.muted});
        scene.innerHTML=svg(960,490,g,'Hierarchical deterministic key tree');layer.textContent='BIP32 tree · BIP84-style account';status.textContent=s.typo?'restored with a passphrase typo':'restored from the seed: same ids';
        const total=s.leakXpub&&s.leakChild;
        aside.innerHTML=K.asideBlock({title:s.typo?'A typo creates a different, empty wallet.':total?'xpub + one child key = every key in the account.':s.leakXpub?'A stolen xpub costs privacy, not coins.':s.leakChild?'One leaked key loses one address.':'One seed, a whole tree of keys.',
          text:s.typo?'Every identifier changed. The passphrase is part of the seed derivation, so a single wrong character opens another (empty) wallet — the coins are not gone, but they are unreachable until the exact passphrase is typed.':total?'Non-hardened derivation lets anyone with the parent xpub and one child private key solve for the parent private key. From there the attacker derives and spends every receive and change key.':s.leakXpub?'The attacker can list every address and follow every payment, but cannot sign anything.':s.leakChild?'Without the xpub, a single child private key reveals only its own address.':'Restoring the same words on any device regenerates exactly the same tree. The watch-only server sees addresses (blue) but holds no private keys.',
          takeaway:'Back up the seed once; share xpubs only with parties you would trust with your full payment history.',
          stats:K.readouts([['Keys in view',nodes.length],['Watch-only sees',s.watch?'all addresses':'nothing'],['Attacker can spend',total?'whole account':s.leakChild?'1 address':'nothing',total||s.leakChild?'bad':'good'],['Attacker can see',s.leakXpub?'all addresses':s.leakChild?'1 address':'nothing',s.leakXpub?'bad':'']]),
          tries:['Turn on “Attacker steals the xpub”: what can they do?','Add “steals one child key”. What happens to the tree?','Restore with a passphrase typo: compare the ids.']});
      }
      function draw(){if(s.view==='backup')drawBackup();else drawTree();}
      main.querySelectorAll('.demo-tab').forEach(b=>b.addEventListener('click',()=>{s.view=b.dataset.value;main.querySelectorAll('.demo-tab').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));build();draw();}));
      build();draw();
      this.state=()=>({view:s.view,words:s.words,known:s.known,pass:s.pass,searchBits:searchBits(s.words,s.words-s.known,PASS[s.pass].bits),leakXpub:s.leakXpub,leakChild:s.leakChild});
    }});
})(typeof window!=='undefined'?window:globalThis);

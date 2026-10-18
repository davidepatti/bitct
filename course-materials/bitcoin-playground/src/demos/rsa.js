/* Tool · Modular clock and toy RSA. */
(function(root){
  'use strict';
  const mod=(a,n)=>((a%n)+n)%n;
  const gcd=(a,b)=>{a=Math.abs(a);b=Math.abs(b);while(b)[a,b]=[b,a%b];return a;};
  function inv(a,n){let [t,nt,r,nr]=[0,1,n,mod(a,n)];while(nr){const q=Math.floor(r/nr);[t,nt]=[nt,t-q*nt];[r,nr]=[nr,r-q*nr];}return r===1?mod(t,n):null;}
  function modpow(b,e,n){let r=1n,B=BigInt(mod(b,n)),E=BigInt(e);const N=BigInt(n);while(E>0n){if(E&1n)r=r*B%N;B=B*B%N;E>>=1n;}return Number(r);}
  /* Repeatedly apply x → x+a, x·a or (powers) a^k, starting from 0 or 1, until the orbit repeats. */
  function orbit(op,a,n){const start=op==='add'?0:1,seen=new Map(),seq=[];let x=start;while(!seen.has(x)){seen.set(x,seq.length);seq.push(x);x=op==='add'?mod(x+a,n):mod(x*a,n);}return {seq,loopTo:seen.get(x)};}
  const PRIMES=[5,7,11,13,17,19,23,29,31,37,41,43,47,53,59,61,67,71,73,79,83,89,97];
  function keys(p,q,ePref){const n=p*q,phi=(p-1)*(q-1);const e=[ePref,3,5,7,11,13,17,19,23,29,31,37,41,43,47,53].find(x=>x>1&&x<phi&&gcd(x,phi)===1);return {n,phi,e,d:inv(e,phi)};}
  const encrypt=(m,k)=>modpow(m,k.e,k.n),decrypt=(c,k)=>modpow(c,k.d,k.n);
  function factor(n){for(let d=2;d*d<=n;d++)if(n%d===0)return {p:d,q:n/d,tries:d-1};return {p:n,q:1,tries:Math.floor(Math.sqrt(n))};}
  /* Rough growth of the general number field sieve, calibrated to RSA-768 (≈ 2,000 core-years, 2009). */
  const L=bits=>{const ln=bits*Math.LN2;return Math.exp(Math.cbrt(64/9)*Math.cbrt(ln)*Math.pow(Math.log(ln),2/3));};
  const gnfsCoreYears=bits=>2000*L(bits)/L(768);
  const trialCoreYears=bits=>Math.pow(2,bits/2)/1e9/3.15576e7;
  const model={mod,gcd,inv,modpow,orbit,PRIMES,keys,encrypt,decrypt,factor,gnfsCoreYears,trialCoreYears};
  if(typeof module!=='undefined'&&module.exports){module.exports=model;return;}

  const K=root.PlaygroundKit,{t,svg,colors:C,fmt,sci}=K;
  K.register({id:'modular-rsa',number:'04',module:'M 1.2',moduleName:'History',kind:'Modular arithmetic',color:C.purple,
    title:'Modular clock and toy RSA',
    description:'Count on a clock that wraps around, find inverses, then build a toy RSA key from two small primes. Encrypt, sign, and watch factoring become hopeless as the primes grow.',
    preview(){let g='<circle cx="90" cy="84" r="58" fill="#fffdf7" stroke="#cfc8b9" stroke-width="2"/>';for(let i=0;i<12;i++){const a=-Math.PI/2+i*Math.PI/6;g+=`<circle cx="${90+Math.cos(a)*58}" cy="${84+Math.sin(a)*58}" r="4" fill="${[1,5,7,11].includes(i)?'#8256d8':'#cfc8b9'}"/>`;}g+=`<path d="M90 26L148 84L90 142L32 84Z" fill="none" stroke="#8256d8" stroke-width="1.6" opacity=".6"/><text x="172" y="70" font-size="17" font-family="Menlo,monospace" fill="#29323c">c = mᵉ mod n</text><text x="172" y="104" font-size="17" font-family="Menlo,monospace" fill="#29323c">m = cᵈ mod n</text>`;return `<svg viewBox="0 0 320 168">${g}</svg>`;},
    mount(main,{reduced}){
      const s={view:'clock',n:13,a:2,op:'mul',p:11,q:17,e:7,m:42,sign:0,searchAt:0,found:false};
      let stopAnim=null;
      const pidx={format:v=>String(PRIMES[v])};
      main.innerHTML=K.page(this,{tabs:K.tabs('view',[{value:'clock',label:'1 · Clock arithmetic'},{value:'rsa',label:'2 · Toy RSA'},{value:'break',label:'3 · Breaking it'}],s.view),
        notes:`<ul><li><strong>Modular arithmetic.</strong> Working mod n keeps only the remainder after dividing by n, so numbers wrap around a clock. a has a multiplicative inverse mod n exactly when gcd(a, n) = 1; multiplying by a then shuffles the units of the clock without losing any.</li><li><strong>RSA</strong> (1977). n = p·q is public; φ(n) = (p−1)(q−1) stays private. Pick e coprime to φ(n) and d with e·d ≡ 1 (mod φ(n)). Then (mᵉ)ᵈ ≡ m (mod n). Encryption uses the public e; signing uses the private d. Real RSA uses 2,048-bit or larger n and padding (OAEP, PSS); textbook RSA as shown here is insecure.</li><li><strong>Factoring estimates</strong> are order-of-magnitude extrapolations of the number field sieve's heuristic cost, calibrated so RSA-768 ≈ 2,000 single-core years (its 2009 factorization). Trial division assumes 10⁹ divisions per second.</li><li>Bitcoin does not use RSA: its signatures use elliptic curves (see the elliptic-curve clock). RSA appears in the course as cypherpunk history and as the classic example of a one-way function with a trapdoor.</li></ul>`});
      const scene=main.querySelector('#scene'),controls=main.querySelector('#controls'),aside=main.querySelector('#aside'),layer=main.querySelector('#layer'),status=main.querySelector('#scene-status');
      const P=()=>PRIMES[s.p],Q=()=>PRIMES[s.q];s.p=PRIMES.indexOf(11);s.q=PRIMES.indexOf(17);
      function stop(){if(stopAnim){stopAnim();stopAnim=null;}}
      function build(){stop();
        if(s.view==='clock')controls.innerHTML=K.slider({key:'n',label:'Clock size n',min:2,max:36,value:s.n})+K.slider({key:'a',label:'Step a',min:1,max:35,value:Math.min(s.a,35)})+K.segmented({key:'op',label:'Operation',options:[{value:'add',label:'x → x + a'},{value:'mul',label:'x → x · a'}],value:s.op});
        if(s.view==='rsa')controls.innerHTML=K.slider({key:'p',label:'Prime p',min:0,max:PRIMES.length-1,value:s.p,format:pidx.format})+K.slider({key:'q',label:'Prime q',min:0,max:PRIMES.length-1,value:s.q,format:pidx.format})+K.segmented({key:'e',label:'Public exponent e',options:[3,5,7,17].map(v=>({value:v,label:String(v)})),value:s.e})+K.slider({key:'m',label:'Message m (a number < n)',min:0,max:P()*Q()-1,value:Math.min(s.m,P()*Q()-1)})+K.segmented({key:'sign',label:'Use the key to …',options:[{value:0,label:'Encrypt'},{value:1,label:'Sign'}],value:s.sign});
        if(s.view==='break')controls.innerHTML=`<div class="demo-actions"><button class="primary" id="factor">▶ &nbsp; Factor n by trial division</button><span class="note" id="fnote"></span></div>`+K.slider({key:'p',label:'Prime p',min:0,max:PRIMES.length-1,value:s.p,format:pidx.format})+K.slider({key:'q',label:'Prime q',min:0,max:PRIMES.length-1,value:s.q,format:pidx.format});
        K.bindControls(controls,s,{p:pidx,q:pidx},key=>{if(key==='p'||key==='q'){s.searchAt=0;s.found=false;if(s.view==='rsa'){const n=P()*Q(),inp=controls.querySelector('input[data-key="m"]');inp.max=n-1;if(s.m>n-1){s.m=n-1;K.setSlider(controls,'m',s.m);}}}draw();});
        const f=controls.querySelector('#factor');if(f)f.onclick=()=>{stop();const n=P()*Q(),r=factor(n);s.searchAt=1;s.found=false;if(reduced){s.searchAt=r.p;s.found=true;draw();return;}let acc=0;stopAnim=K.loop(dt=>{acc+=dt;if(acc<Math.max(15,600/r.p))return;acc=0;s.searchAt++;if(s.searchAt>=r.p){s.searchAt=r.p;s.found=true;draw();stopAnim=null;return false;}draw();});draw();};
      }
      function clock(cx,cy,R,n,mark={},hl=new Set()){let g=`<circle cx="${cx}" cy="${cy}" r="${R}" fill="#fffdf7" stroke="#d8d0c0" stroke-width="2"/>`;const pt=i=>{const a=-Math.PI/2+i/n*2*Math.PI;return [cx+Math.cos(a)*R,cy+Math.sin(a)*R];};
        for(let i=0;i<n;i++){const [x,y]=pt(i),a=-Math.PI/2+i/n*2*Math.PI;g+=`<circle cx="${x}" cy="${y}" r="${mark[i]?9:6}" fill="${mark[i]||(hl.has(i)?'#cdbdf0':'#e9e5da')}" stroke="#29323c" stroke-width="${mark[i]?1.5:0.6}"/>`;if(n<=40)g+=t(cx+Math.cos(a)*(R+20),cy+Math.sin(a)*(R+20)+4,String(i),{size:11,anchor:'middle',fill:C.muted});}return {g,pt};}
      function drawClock(){
        const n=s.n,a=s.a%n,o=orbit(s.op,a,n),g0=gcd(a,n),iv=inv(a,n);const c=clock(240,250,170,n,{},new Set(o.seq));let g=c.g;
        let d='';o.seq.forEach((x,i)=>{const [X,Y]=c.pt(x);d+=(i?'L':'M')+X.toFixed(1)+' '+Y.toFixed(1);});const [lx,ly]=c.pt(o.seq[o.loopTo]);d+=`L${lx.toFixed(1)} ${ly.toFixed(1)}`;
        g+=`<path d="${d}" fill="none" stroke="${C.purple}" stroke-width="2" opacity=".75" stroke-linejoin="round"/>`;const [sx,sy]=c.pt(o.seq[0]);g+=`<circle cx="${sx}" cy="${sy}" r="9" fill="#f3bc59" stroke="#29323c" stroke-width="1.5"/>`;
        const rx=500;g+=t(rx,40,s.op==='add'?`Start at 0, keep adding ${a} (mod ${n})`:`Start at 1, keep multiplying by ${a} (mod ${n})`,{size:13,weight:700,fill:C.muted});
        o.seq.slice(0,28).forEach((x,i)=>{const X=rx+(i%7)*62,Y=84+Math.floor(i/7)*44;g+=`<rect x="${X}" y="${Y-23}" width="50" height="32" rx="7" fill="#efe8fb" stroke="#cdbdf0"/>`+t(X+25,Y,String(x),{size:13,weight:700,anchor:'middle',cls:'mono'});if(i<o.seq.length-1&&(i%7)<6)g+=t(X+56,Y-2,'›',{size:13,fill:C.muted,anchor:'middle'});});
        const rws=Math.ceil(Math.min(o.seq.length,28)/7),gy=84+(rws-1)*44+(o.seq.length>28?104:80);if(o.seq.length>28)g+=t(rx,gy-46,`… ${o.seq.length} values before repeating`,{size:12,fill:C.muted});
        g+=t(rx,gy,`gcd(${a}, ${n}) = ${g0}`,{size:20,weight:700,cls:'mono',fill:g0===1?C.green:C.red});
        let ly2=gy+42;if(iv!==null){g+=t(rx,ly2,`inverse: ${a} · ${iv} ≡ 1 (mod ${n})`,{size:16,weight:600,cls:'mono'});}else{g+=t(rx,ly2,'no inverse:',{size:16,weight:600,cls:'mono',fill:C.red})+t(rx,ly2+34,`nothing × ${a} gives 1`,{size:16,weight:600,cls:'mono',fill:C.red});ly2+=34;}
        if(s.op==='mul'){const msg=o.seq.length===n-1?'visits every non-zero number: a generator':g0===1?`cycles through ${o.seq.length} of the ${n} numbers`:'never returns to 1: it falls into a shorter loop',ws=[''];msg.split(' ').forEach(w=>{if((ws.at(-1)+' '+w).trim().length>36)ws.push(w);else ws[ws.length-1]=(ws.at(-1)+' '+w).trim();});ws.forEach((l,i)=>{g+=t(rx,ly2+42+i*28,l,{size:13,fill:C.muted});});}
        scene.innerHTML=svg(960,500,g,'Modular arithmetic on a clock');layer.textContent='Arithmetic modulo n';status.textContent=`n = ${n} · a = ${a}`;
        aside.innerHTML=K.asideBlock({title:s.op==='add'?'Adding wraps around the clock.':iv!==null?`${a} has an inverse mod ${n}.`:`${a} shares a factor with ${n}: no inverse.`,text:s.op==='add'?`Steps of ${a} visit ${o.seq.length} of the ${n} positions. They cover every position exactly when gcd(${a}, ${n}) = 1.`:iv!==null?`Multiplying by ${a} can be undone by multiplying by ${iv}. Division exists on this clock for numbers coprime to ${n}. RSA's private exponent is exactly such an inverse.`:`Because ${a} and ${n} share the factor ${g0}, multiplying by ${a} loses information and cannot be undone.`,
          takeaway:'Modular arithmetic gives a finite world where “undo” exists only for coprime numbers — the arithmetic behind RSA and elliptic curves.',
          stats:K.readouts([['gcd(a, n)',g0,g0===1?'good':'bad'],['Inverse of a',iv===null?'none':iv,'accent'],['Orbit length',o.seq.length],['Clock size',n]]),
          tries:['Set n = 12 and try a = 5, then a = 6. What changes?','Choose a prime n (e.g. 13): which a have inverses?','Look for a step a that visits every non-zero number when multiplying (n = 13, a = 2).']});
      }
      function drawRsa(){
        const p=P(),q=Q();let g='';
        if(p===q){scene.innerHTML=svg(960,500,t(480,250,'Choose two different primes.',{size:20,weight:700,anchor:'middle',fill:C.red}),'RSA');aside.innerHTML=K.asideBlock({title:'p and q must differ.',text:'With p = q, n is a square and its square root reveals the key immediately.'});return;}
        const k=keys(p,q,s.e),m=Math.min(s.m,k.n-1),c=s.sign?modpow(m,k.d,k.n):encrypt(m,k),back=s.sign?modpow(c,k.e,k.n):decrypt(c,k);
        const rows=[['n = p · q',`${p} · ${q} = ${k.n}`,'public'],['φ(n) = (p−1)(q−1)',`${p-1} · ${q-1} = ${k.phi}`,'private'],['e',`${k.e}${k.e!==s.e?` (${s.e} not coprime)`:''}`,'public'],['d = e⁻¹ mod φ(n)',`${k.d}`,'private']];
        g+=t(30,36,'KEY GENERATION',{size:12,weight:700,fill:C.muted});
        rows.forEach(([a,b,who],i)=>{const y=84+i*44;g+=t(30,y,a,{size:15,weight:600,cls:'mono'})+t(300,y,b,{size:15,cls:'mono'})+`<rect x="556" y="${y-22}" width="96" height="30" rx="15" fill="${who==='public'?'#e3f1e5':'#f6d6d3'}"/>`+t(604,y,who,{size:11,weight:700,anchor:'middle',fill:who==='public'?'#2f7342':'#a3332d'});});
        g+=t(30,254,`check: ${k.e} · ${k.d} = ${k.e*k.d} ≡ 1 (mod ${k.phi})`,{size:12,fill:C.muted,cls:'mono'});
        const PY=318;g+=t(30,PY-18,s.sign?'SIGN WITH d, VERIFY WITH e':'ENCRYPT WITH e, DECRYPT WITH d',{size:12,weight:700,fill:C.muted});
        const box=(x,label,v,col)=>`<rect x="${x}" y="${PY}" width="130" height="84" rx="10" fill="${col}" stroke="#29323c" stroke-width="1.5"/>`+t(x+65,PY+28,label,{size:11,weight:700,anchor:'middle',fill:C.muted})+t(x+65,PY+68,String(v),{size:22,weight:700,anchor:'middle',cls:'mono'});
        g+=box(30,'message m',m,'#efe8fb')+box(250,s.sign?'signature s':'ciphertext c',c,'#f7daa0')+box(470,s.sign?'recovered':'decrypted',back,back===m?'#e3f1e5':'#f6d6d3');
        g+=`<path d="M164 ${PY+42}H246" stroke="#29323c" stroke-width="2" marker-end="url(#k-arrow)"/><path d="M384 ${PY+42}H466" stroke="#29323c" stroke-width="2" marker-end="url(#k-arrow)"/>`+t(205,PY+120,s.sign?`mᵈ mod ${k.n}`:`mᵉ mod ${k.n}`,{size:12,anchor:'middle',cls:'mono'})+t(425,PY+120,s.sign?`sᵉ mod ${k.n}`:`cᵈ mod ${k.n}`,{size:12,anchor:'middle',cls:'mono'});
        /* permutation scatter */
        const N=k.n,step=Math.max(1,Math.ceil(N/1600)),X0=690,Y0=60,W=240;g+=t(X0,36,`m → ${s.sign?'s':'c'} for every m`,{size:12,weight:700,fill:C.muted});g+=`<rect x="${X0}" y="${Y0}" width="${W}" height="${W}" fill="#fbf8ef" stroke="#e1dacb"/>`;
        for(let x=0;x<N;x+=step){const y=s.sign?modpow(x,k.d,N):modpow(x,k.e,N);g+=`<rect x="${(X0+x/N*W).toFixed(1)}" y="${(Y0+W-y/N*W-1.6).toFixed(1)}" width="1.6" height="1.6" fill="${C.purple}" opacity=".55"/>`;}
        g+=`<circle cx="${X0+m/N*W}" cy="${Y0+W-c/N*W}" r="7" fill="#f3bc59" stroke="#29323c" stroke-width="1.5"/>`+t(X0,Y0+W+28,'m →',{size:11,fill:C.muted})+t(X0-8,Y0+18,'↑',{size:11,fill:C.muted,anchor:'end'})+t(X0+W,Y0+W+28,'a scrambled shuffle',{size:11,fill:C.muted,anchor:'end'});
        const wrapL=(str,max)=>{const out=[''];str.split(' ').forEach(w=>{if((out.at(-1)+' '+w).trim().length>max)out.push(w);else out[out.length-1]=(out.at(-1)+' '+w).trim();});return out;};
        let ly=PY+176;
        wrapL(s.sign?`Anyone with (n, e) = (${k.n}, ${k.e}) can check sᵉ = m. Only the holder of d could produce s.`:`Anyone with (n, e) = (${k.n}, ${k.e}) can encrypt. Only the holder of d = ${k.d} can decrypt.`,80).forEach(l=>{g+=t(30,ly,l,{size:14,weight:600});ly+=30;});
        wrapL('d is easy to compute from φ(n) — and φ(n) is easy from p and q. Hiding p and q is everything.',88).forEach(l=>{g+=t(30,ly,l,{size:13,fill:C.muted});ly+=28;});
        scene.innerHTML=svg(960,ly,g,'Toy RSA key generation, encryption and signing');layer.textContent='Toy RSA · textbook, no padding';status.textContent=`n = ${k.n} · ${Math.ceil(Math.log2(k.n))} bits`;
        aside.innerHTML=K.asideBlock({title:back===m?(s.sign?'The signature checks out.':'Decryption recovers the message.'):'Something is off.',text:s.sign?'Signing applies the private exponent; verifying applies the public one. The order is the reverse of encryption.':`(mᵉ)ᵈ ≡ m because e·d ≡ 1 (mod φ(n)). Raising to e scrambles the numbers; raising to d puts them back.`,
          takeaway:'Public key: (n, e). Private key: d. Security rests on not being able to factor n.',
          stats:K.readouts([['n',k.n],['Key size',`${Math.ceil(Math.log2(k.n))} bits`],['Public e',k.e,'good'],['Private d',k.d,'bad']]),
          tries:['Encrypt m = 42, then switch to Sign: which exponent is used first?','Try e = 3 with p = 7: why is it replaced?','Pick the largest primes: does the shuffle look more random?']});
      }
      function drawBreak(){
        const p=P(),q=Q(),n=p*q,r=factor(n),bits=Math.log2(n);let g='';
        g+=t(30,36,`FACTOR n = ${n} BY TRIAL DIVISION`,{size:12,weight:700,fill:C.muted});
        const upto=Math.min(r.p,s.searchAt||0),cells=Math.max(r.p,2);
        for(let d=2;d<=Math.min(cells,97);d++){const X=30+((d-2)%12)*46,Y=60+Math.floor((d-2)/12)*38,tried=d<=upto,hit=s.found&&d===r.p;g+=`<rect x="${X}" y="${Y}" width="40" height="30" rx="5" fill="${hit?C.green:tried?'#e9e5da':'#fffdf7'}" stroke="${hit?'#29323c':'#d8d0c0'}"/>`+t(X+20,Y+22,String(d),{size:12,weight:hit?700:500,anchor:'middle',fill:hit?'#fff':C.ink});}
        g+=t(30,452,s.found?`${n} = ${r.p} × ${r.q} after ${r.tries} divisions. The private key follows.`:s.searchAt?`trying ${s.searchAt} …`:'Press “Factor” to search for a divisor.',{size:15,weight:700,fill:s.found?C.green:C.ink});
        const xr=[16,4096],yr=[1e-12,1e30];
        const pts1=[],pts2=[];for(let b=16;b<=4096;b*=1.08){if(trialCoreYears(b)<1e30)pts1.push([b,trialCoreYears(b)]);if(gnfsCoreYears(b)<1e30)pts2.push([b,gnfsCoreYears(b)]);}
        g+=t(610,30,'TIME TO FACTOR',{size:12,weight:700,fill:C.muted})+t(610,56,'single-core years, log scale',{size:11,fill:C.muted});
        g+=K.plot({x:700,y:84,w:230,h:270,xr,yr,xlog:true,ylog:true,xticks:[16,64,256,1024,4096],yticks:[1e-12,1e-6,1,1e6,1e12,1e18,1e24,1e30],xfmt:v=>String(v),yfmt:v=>v===1?'1':'10'+K.sup(Math.round(Math.log10(v))),xlabel:'bits of n',
          series:[{pts:pts1,color:C.red,width:2,dash:'5 4'},{pts:pts2,color:C.purple,width:2.6}],dots:[{x:Math.max(16,bits),y:Math.max(1e-12,trialCoreYears(Math.max(16,bits))),color:'#f3bc59',label:'your n'},{x:768,y:2000,color:C.ink,label:'RSA-768 (2009)',anchor:'end'},{x:2048,y:gnfsCoreYears(2048),color:C.purple,label:'RSA-2048',anchor:'end'}]});
        g+=t(30,490,'Chart: dashed = trial division · solid = number field sieve (rough)',{size:11,fill:C.muted});
        scene.innerHTML=svg(960,510,g,'Trial division of a toy modulus and factoring cost by key size');layer.textContent='Factoring · the trapdoor';status.textContent=`n = ${n} · ${fmt(bits,1)} bits`;
        const fn=controls.querySelector('#fnote');if(fn)fn.textContent=s.found?`${r.tries} divisions`:'';
        aside.innerHTML=K.asideBlock({title:'Toy keys fall instantly. Real ones do not.',text:`${[8,11,18].includes(Math.ceil(bits))?'An':'A'} ${Math.ceil(bits)}-bit n has a divisor below √n ≈ ${fmt(Math.sqrt(n))}, so trial division needs at most that many tries. Every extra bit multiplies √n by √2; the best known algorithm grows more slowly, but still far beyond reach at 2,048 bits.`,
          takeaway:'Multiplying two primes is instant; undoing the multiplication is not. That asymmetry is the trapdoor.',
          stats:K.readouts([['Your n',`${n} (${Math.ceil(bits)} bits)`],['Divisions needed',fmt(r.tries)],['RSA-2048, best known method',`≈ ${sci(gnfsCoreYears(2048),1)} core-years`,'wide bad']]),
          tries:['Factor the smallest and the largest toy n.','Follow the solid curve from 768 to 2,048 bits.','Why must p and q stay secret even though n is public?']});
      }
      function draw(){if(s.view==='clock')drawClock();else if(s.view==='rsa')drawRsa();else drawBreak();}
      main.querySelectorAll('.demo-tab').forEach(b=>b.addEventListener('click',()=>{s.view=b.dataset.value;main.querySelectorAll('.demo-tab').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));s.searchAt=0;s.found=false;build();draw();}));
      build();draw();
      this.state=()=>({view:s.view,n:s.n,a:s.a,p:P(),q:Q(),e:s.e,m:s.m});
      return stop;
    }});
})(typeof window!=='undefined'?window:globalThis);

/* Tool 02 · Elliptic-curve clock. Toy curves y² = x³ + 7 over small prime fields. */
(function(root){
  'use strict';
  const mod=(a,p)=>((a%p)+p)%p;
  function inv(a,p){let [t,nt,r,nr]=[0,1,p,mod(a,p)];while(nr){const q=Math.floor(r/nr);[t,nt]=[nt,t-q*nt];[r,nr]=[nr,r-q*nr];}if(r!==1)throw new Error('not invertible');return mod(t,p);}
  const onCurve=(P,p)=>P===null||mod(P[1]*P[1]-(P[0]**3+7),p)===0;
  function add(P,Q,p){
    if(P===null)return Q;if(Q===null)return P;
    const [x1,y1]=P,[x2,y2]=Q;
    if(x1===x2&&mod(y1+y2,p)===0)return null;
    const l=x1===x2?mod(3*x1*x1*inv(2*y1,p),p):mod((y2-y1)*inv(x2-x1,p),p);
    const x3=mod(l*l-x1-x2,p);return [x3,mod(l*(x1-x3)-y1,p)];
  }
  /* Double-and-add, counting the group operations a wallet would perform. */
  function mul(k,P,p){const bits=k.toString(2);let R=P,doubles=0,adds=0;
    for(let i=1;i<bits.length;i++){R=add(R,R,p);doubles++;if(bits[i]==='1'){R=add(R,P,p);adds++;}}
    return {point:R,doubles,adds};}
  function curve(p){
    const points=[];for(let x=0;x<p;x++)for(let y=0;y<p;y++)if(mod(y*y-(x**3+7),p)===0)points.push([x,y]);
    const n=points.length+1,G=points.find(([x,y])=>y<=p/2&&x>0)||points[0];
    return {p,n,points,G};
  }
  const multiples=(c)=>{const out=[null];let R=null;for(let k=1;k<c.n;k++){R=add(R,c.G,c.p);out.push(R);}return out;};
  /* Brute force: try d = 1, 2, 3 … until d·G matches. */
  function bruteForce(c,target){let R=null;for(let k=1;k<=c.n;k++){R=add(R,c.G,c.p);if(R&&target&&R[0]===target[0]&&R[1]===target[1])return k;}return null;}
  /* Real-number picture for chord-and-tangent addition. */
  const x0=-Math.cbrt(7);
  function realPoint(t){const s=Math.sign(t)||1,x=x0+Math.abs(t)**1.6*(3.0-x0);return [x,s*Math.sqrt(Math.max(0,x**3+7))];}
  function realAdd(P,Q){
    const [x1,y1]=P,[x2,y2]=Q,same=Math.abs(x1-x2)<1e-9&&Math.abs(y1-y2)<1e-9;
    if(Math.abs(x1-x2)<1e-9&&!same)return {infinity:true};
    if(same&&Math.abs(y1)<1e-9)return {infinity:true};
    const l=same?3*x1*x1/(2*y1):(y2-y1)/(x2-x1),x3=l*l-x1-x2,y3=l*(x1-x3)-y1;return {infinity:false,lambda:l,third:[x3,-y3],sum:[x3,y3],tangent:same};
  }
  const SECP={bits:256,n:1.158e77};
  const model={mod,inv,add,mul,curve,multiples,onCurve,bruteForce,realPoint,realAdd,SECP};
  if(typeof module!=='undefined'&&module.exports){module.exports=model;return;}

  const K=root.PlaygroundKit,{t,svg,colors:C,fmt,sci,esc}=K;
  const FIELDS=[13,43,67];
  K.register({id:'curve-clock',number:'06',module:'M 2.0',moduleName:'Cryptographic foundations',kind:'Elliptic curves',color:C.purple,
    title:'The elliptic-curve clock',
    description:'Add points on y² = x³ + 7, then multiply a private key by G and watch the public key land somewhere unpredictable. Easy forward, hopeless backward.',
    preview(){const c=curve(43),m=multiples(c);let g='';c.points.forEach(([x,y])=>{g+=`<circle cx="${20+x*6.6}" cy="${158-y*3.3}" r="2.6" fill="#cdbdf0"/>`;});let d='';for(let k=1;k<9;k++){const P=m[k];d+=(k===1?'M':'L')+(20+P[0]*6.6)+' '+(158-P[1]*3.3);}g+=`<path d="${d}" fill="none" stroke="${C.purple}" stroke-width="1.6" opacity=".7"/>`;const P=m[8];g+=`<circle cx="${20+P[0]*6.6}" cy="${158-P[1]*3.3}" r="6" fill="${C.purple}" stroke="#29323c" stroke-width="1.5"/>`;
      g+=`<circle cx="${20+m[1][0]*6.6}" cy="${158-m[1][1]*3.3}" r="5" fill="#f3bc59" stroke="#29323c" stroke-width="1.5"/>`;return `<svg viewBox="0 0 320 168">${g}</svg>`;},
    mount(main,{reduced}){
      const s={view:'real',tP:0.25,tQ:0.55,field:43,d:9,path:1,target:null,searchK:0,found:false,bits:256};
      let c=curve(s.field),mult=multiples(c),stopAnim=null;
      const specs={tP:{format:v=>v.toFixed(2)},tQ:{format:v=>v.toFixed(2)},d:{format:v=>String(v)},bits:{format:v=>v+' bits'}};
      main.innerHTML=K.page(this,{tabs:K.tabs('view',[{value:'real',label:'1 · Adding points'},{value:'clock',label:'2 · Private key → public key'},{value:'oneway',label:'3 · Why it is one-way'}],s.view),
        notes:`<ul><li><strong>Toy fields.</strong> Bitcoin's secp256k1 uses the same equation, y² = x³ + 7, over a 256-bit prime field with about 1.16 × 10⁷⁷ points. Here p is 13, 43 or 67, so every point fits on screen. These toy groups have prime order, like secp256k1.</li><li><strong>Notation.</strong> d is the private key, G the generator, P = d·G the public key, n the group order. “∞” is the point at infinity, the group's zero.</li><li><strong>Operation count.</strong> The wallet uses double-and-add: roughly one doubling per key bit plus one addition per 1-bit. The best known generic attacks on the discrete logarithm (e.g. Pollard's rho) need about √n steps, ≈ 2¹²⁸ for secp256k1. That is faster than trying every key, and still far out of reach.</li><li>The real-number view only explains the geometry; Bitcoin never uses real numbers. Over a finite field the “line” wraps around, so the points look scattered.</li></ul>`});
      const scene=main.querySelector('#scene'),controls=main.querySelector('#controls'),aside=main.querySelector('#aside'),layer=main.querySelector('#layer'),status=main.querySelector('#scene-status');
      function buildControls(){
        if(s.view==='real')controls.innerHTML=K.slider({key:'tP',label:'Move P along the curve',min:-1,max:1,step:0.01,value:s.tP,format:specs.tP.format})+K.slider({key:'tQ',label:'Move Q along the curve',min:-1,max:1,step:0.01,value:s.tQ,format:specs.tQ.format})+`<div class="demo-actions"><button id="dbl">Make Q = P (doubling)</button><button id="neg">Make Q = −P</button></div>`;
        if(s.view==='clock')controls.innerHTML=K.segmented({key:'field',label:'Toy field size p',options:FIELDS.map(p=>({value:p,label:`p = ${p}`})),value:s.field})+K.slider({key:'d',label:'Private key d',min:1,max:2*c.n,value:s.d,format:specs.d.format,hint:'Goes past n on purpose: the clock wraps.'})+K.segmented({key:'path',label:'Show the hops G, 2G, 3G …',options:[{value:1,label:'Show'},{value:0,label:'Hide'}],value:s.path});
        if(s.view==='oneway')controls.innerHTML=`<div class="demo-actions"><button class="primary" id="search">▶ &nbsp; Brute-force the key</button><button id="newkey">New secret key</button><span class="note" id="search-note"></span></div>`+K.slider({key:'bits',label:'Key size (scale it up)',min:8,max:256,step:8,value:s.bits,format:specs.bits.format});
        K.bindControls(controls,s,specs,key=>{if(key==='field'){c=curve(s.field);mult=multiples(c);s.d=Math.min(s.d,2*c.n);buildControls();}draw();});
        const q=id=>controls.querySelector('#'+id);
        if(q('dbl'))q('dbl').onclick=()=>{s.tQ=s.tP;K.setSlider(controls,'tQ',s.tQ,specs.tQ);draw();};
        if(q('neg'))q('neg').onclick=()=>{s.tQ=-s.tP;K.setSlider(controls,'tQ',s.tQ,specs.tQ);draw();};
        if(q('search'))q('search').onclick=search;
        if(q('newkey'))q('newkey').onclick=()=>{newTarget();draw();};
      }
      function newTarget(){if(stopAnim){stopAnim();stopAnim=null;}c=curve(67);mult=multiples(c);const k=2+Math.floor(Math.random()*(c.n-3));s.target={k,point:mult[k]};s.searchK=0;s.found=false;}
      function search(){
        if(stopAnim)stopAnim();s.searchK=0;s.found=false;const answer=bruteForce(c,s.target.point);
        if(reduced){s.searchK=answer;s.found=true;draw();return;}
        let acc=0;stopAnim=K.loop(dt=>{acc+=dt;if(acc<70)return;acc=0;s.searchK++;if(s.searchK>=answer){s.searchK=answer;s.found=true;draw();stopAnim=null;return false;}draw();});
      }
      const sxR=x=>420+x*115,syR=y=>250-y*39,onScreen=([x,y])=>sxR(x)>30&&sxR(x)<930&&syR(y)>16&&syR(y)<484;
      function drawReal(){
        let g='<clipPath id="real-clip"><rect x="20" y="10" width="920" height="480"/></clipPath><g clip-path="url(#real-clip)">';
        g+=`<line x1="40" x2="940" y1="250" y2="250" stroke="#d6cfbf"/><line x1="420" x2="420" y1="20" y2="490" stroke="#d6cfbf"/>`;
        let up='',down='';for(let i=0;i<=200;i++){const x=x0+(i/200)**2*(4.2-x0),y=Math.sqrt(Math.max(0,x**3+7));up+=(i?'L':'M')+sxR(x).toFixed(1)+' '+syR(y).toFixed(1);down+=(i?'L':'M')+sxR(x).toFixed(1)+' '+syR(-y).toFixed(1);}
        g+=`<path d="${up}" fill="none" stroke="#bfb2dc" stroke-width="3"/><path d="${down}" fill="none" stroke="#bfb2dc" stroke-width="3"/>`;
        g+=t(50,470,'y² = x³ + 7',{size:22,weight:700,fill:'#7a6aa6',cls:'hand'});
        const P=realPoint(s.tP),Q=realPoint(s.tQ),r=realAdd(P,Q);let head,body,result;
        if(r.infinity){
          g+=`<line x1="${sxR(P[0])}" x2="${sxR(P[0])}" y1="20" y2="490" stroke="${C.orange}" stroke-width="2.4" stroke-dasharray="7 6"/>`;
          head='The line never comes back: P + Q = ∞.';body='When Q is the mirror image of P, the line through them is vertical and meets the curve nowhere else. That missing third point is the “point at infinity”, which acts like zero: P + (−P) = ∞.';result='∞ (identity)';
        }else{
          const [x3,y3]=r.sum,xs=[P[0],Q[0],x3],lo=Math.min(...xs)-0.6,hi=Math.max(...xs)+0.6,yl=x=>P[1]+r.lambda*(x-P[0]);
          g+=`<line x1="${sxR(lo)}" y1="${syR(yl(lo))}" x2="${sxR(hi)}" y2="${syR(yl(hi))}" stroke="${C.orange}" stroke-width="2.4"/>`;
          g+=`<line x1="${sxR(x3)}" y1="${syR(-y3)}" x2="${sxR(x3)}" y2="${syR(y3)}" stroke="${C.muted}" stroke-width="1.8" stroke-dasharray="6 6" marker-end="url(#k-arrow)"/>`;
          g+=`<circle cx="${sxR(x3)}" cy="${syR(-y3)}" r="7" fill="#fffdf7" stroke="${C.orange}" stroke-width="2.4"/>`+(onScreen([x3,-y3])&&Math.hypot(sxR(x3)-sxR(P[0]),syR(-y3)-syR(P[1]))>90&&Math.hypot(sxR(x3)-sxR(Q[0]),syR(-y3)-syR(Q[1]))>90?t(sxR(x3)+(sxR(x3)>760?-12:12),syR(-y3)+(y3>0?26:-12),'third crossing',{size:13,fill:C.orange,weight:600,cls:'halo',anchor:sxR(x3)>760?'end':'start'}):'');
          g+=`<circle cx="${sxR(x3)}" cy="${syR(y3)}" r="10" fill="${C.purple}" stroke="#29323c" stroke-width="2"/>`+(onScreen(r.sum)?t(sxR(x3)+(sxR(x3)>780?-15:15),syR(y3)+(y3>0?-12:30),r.tangent?'2P':'P + Q',{size:18,weight:700,fill:C.purple,cls:'halo',anchor:sxR(x3)>780?'end':'start'}):'');
          head=r.tangent?'Doubling: use the tangent line.':'Draw a line, find the third crossing, flip it.';
          body=r.tangent?'When Q equals P there is no “line through two points”, so the tangent at P is used. Its other crossing, mirrored across the x-axis, is 2P. Repeated doubling is how a wallet computes d·G quickly.':'A straight line through P and Q meets the curve at exactly one more point. Mirror it across the x-axis and you get P + Q. That simple rule makes the points a group: you can add them, and the order does not matter.';
          result=`(${x3.toFixed(2)}, ${y3.toFixed(2)})`;
          if(!onScreen(r.sum))g+=`</g>`+t(930,40,`P + Q is off the drawing, at (${x3.toFixed(1)}, ${y3.toFixed(1)})`,{size:14,weight:700,anchor:'end',fill:C.purple,cls:'halo'})+'<g>';
        }
        g+=`<circle cx="${sxR(P[0])}" cy="${syR(P[1])}" r="9" fill="#f3bc59" stroke="#29323c" stroke-width="2"/>`+t(sxR(P[0])+(sxR(P[0])<90?14:-14),syR(P[1])+(syR(P[1])<50?34:-14),'P',{size:18,weight:700,anchor:sxR(P[0])<90?'start':'end',cls:'halo'});
        if(!(Math.abs(P[0]-Q[0])<1e-9&&Math.abs(P[1]-Q[1])<1e-9))g+=`<circle cx="${sxR(Q[0])}" cy="${syR(Q[1])}" r="9" fill="#9fd0f2" stroke="#29323c" stroke-width="2"/>`+t(sxR(Q[0])+(sxR(Q[0])<90?14:-14),syR(Q[1])+(Q[1]<0?(syR(Q[1])>450?-14:30):(syR(Q[1])<50?34:-14)),'Q',{size:18,weight:700,anchor:sxR(Q[0])<90?'start':'end',cls:'halo'});
        layer.textContent='Point addition · geometric picture';status.textContent='Real numbers · intuition only';
        aside.innerHTML=K.asideBlock({title:head,text:body,takeaway:'Bitcoin uses the same rule, computed with whole numbers modulo a prime instead of real numbers.',stats:K.readouts([['P',`(${P[0].toFixed(2)}, ${P[1].toFixed(2)})`],['Q',`(${Q[0].toFixed(2)}, ${Q[1].toFixed(2)})`],['Result',result,'wide accent']]),tries:['Slide Q until it touches P. The chord becomes a tangent.','Press “Make Q = −P”. Where did the result go?','Move P and Q to the same branch. Is P + Q always on the other side?']});
        g+='</g>';
        return svg(960,500,g,'Chord-and-tangent addition on y squared equals x cubed plus 7');
      }
      function grid(cc,x,y,size,mark){const cell=size/cc.p;let g=`<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="#fbf8ef" stroke="#e1dacb"/>`;
        [0,Math.floor(cc.p/2),cc.p-1].forEach(v=>{g+=t(x+(v+0.5)*cell,y+size+27,String(v),{size:11,anchor:'middle',fill:C.muted})+t(x-8,y+size-(v+0.5)*cell+7,String(v),{size:11,anchor:'end',fill:C.muted});});
        g+=t(x+size/2,y+size+58,'x  (mod p)',{size:12,anchor:'middle',fill:C.muted,weight:600});
        const pos=P=>[x+(P[0]+0.5)*cell,y+size-(P[1]+0.5)*cell];
        cc.points.forEach(P=>{const [X,Y]=pos(P);g+=`<circle cx="${X}" cy="${Y}" r="${Math.max(2.2,Math.min(5,cell*0.3))}" fill="#d2c5ef"/>`;});
        return {g,pos,cell};}
      function drawClock(){
        const k=s.d%c.n,P=k===0?null:mult[k],res=mul(s.d,c.G,c.p),gr=grid(c,70,24,430);let g=gr.g;
        if(s.path&&s.d>1){let d='';const upto=Math.min(s.d,c.n-1);for(let i=1;i<=upto;i++){const [X,Y]=gr.pos(mult[i]);d+=(i===1?'M':'L')+X.toFixed(1)+' '+Y.toFixed(1);}g+=`<path d="${d}" fill="none" stroke="${C.purple}" stroke-width="1.3" opacity=".45" stroke-linejoin="round"/>`;}
        const [gx,gy]=gr.pos(c.G),isG=k===1;g+=`<circle cx="${gx}" cy="${gy}" r="8" fill="#f3bc59" stroke="#29323c" stroke-width="2"/>`+(isG?'':t(gx+12,gy<80?gy+30:gy-10,'G',{size:15,weight:700,cls:'halo'}));
        if(P){const [X,Y]=gr.pos(P);g+=`<circle cx="${X}" cy="${Y}" r="11" fill="${C.purple}" stroke="#29323c" stroke-width="2"/>`+t(X+(X>285?-16:16),(Y<80||Math.hypot(X-gx,Y-gy)<70)?Y+36:Y-14,isG?`${s.d}·G = G`:`${s.d}·G`,{size:15,weight:700,fill:C.purple,anchor:X>285?'end':'start',cls:'halo'});}
        else g+=t(285,24+215,'∞  (d is a multiple of n)',{size:20,weight:700,anchor:'middle',fill:C.purple});
        /* clock face: multiples in order */
        const cx=745,cy=245,R=170;g+=`<circle cx="${cx}" cy="${cy}" r="${R}" fill="#fffdf7" stroke="#d8d0c0" stroke-width="2"/>`;
        for(let i=0;i<c.n;i++){const a=-Math.PI/2+i/c.n*2*Math.PI,r1=i%5===0?R-14:R-8;g+=`<line x1="${cx+Math.cos(a)*r1}" y1="${cy+Math.sin(a)*r1}" x2="${cx+Math.cos(a)*R}" y2="${cy+Math.sin(a)*R}" stroke="${i===k?C.purple:'#bdb4a3'}" stroke-width="${i===k?3:1.4}"/>`;if(c.n<=13||i%Math.ceil(c.n/12)===0)g+=t(cx+Math.cos(a)*(R+18),cy+Math.sin(a)*(R+18)+4,i===0?'∞':String(i),{size:11,anchor:'middle',fill:C.muted});}
        const a=-Math.PI/2+k/c.n*2*Math.PI;g+=`<line x1="${cx}" y1="${cy}" x2="${cx+Math.cos(a)*(R-26)}" y2="${cy+Math.sin(a)*(R-26)}" stroke="${C.purple}" stroke-width="5" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="8" fill="#29323c"/>`;
        g+=t(cx,cy+R+72,'Counting in steps of G:',{size:13,anchor:'middle',fill:C.muted,weight:600})+t(cx,cy+R+102,`${c.n} positions, then it repeats`,{size:13,anchor:'middle',fill:C.muted,weight:600});
        g+=t(285,555,'The same points, plotted by their coordinates',{size:13,anchor:'middle',fill:C.muted,weight:600});
        layer.textContent='Scalar multiplication · toy field';status.textContent=`y² = x³ + 7 mod ${c.p} · n = ${c.n}`;
        aside.innerHTML=K.asideBlock({title:'In order on the clock. Scattered on the grid.',text:`Adding G to itself again and again moves one tick at a time around the clock: an orderly sequence. In coordinates the same hops jump all over the field. Knowing where ${s.d}·G landed tells you almost nothing about how many hops it took.`,
          takeaway:'The public key P = d·G is easy to compute and safe to publish. Recovering d from P is the discrete-logarithm problem.',
          stats:K.readouts([['Private key d',fmt(s.d)],['Public key P = d·G',P?`(${P[0]}, ${P[1]})`:'∞','accent'],['Group order n',fmt(c.n)],['Double-and-add cost',`${res.doubles} doublings + ${res.adds} additions`,'wide']]),
          tries:['Move d one step at a time. Can you predict where the next point appears?',`Set d = ${c.n}. Then try d = ${c.n+1}.`,'Switch to p = 13: the pattern is visible. At p = 67 it already looks random.']});
        return svg(960,575,g,'Toy elliptic curve points and the clock of multiples of G');
      }
      function drawOneway(){
        if(!s.target)newTarget();
        const gr=grid(c,70,24,430);let g=gr.g;const tp=s.target.point,[tx,ty]=gr.pos(tp);
        g+=`<circle cx="${tx}" cy="${ty}" r="13" fill="none" stroke="${C.red}" stroke-width="2.5" stroke-dasharray="4 3"/>`+t(tx+(tx>285?-18:18),ty<80?ty+34:ty-16,'P (published)',{size:13,weight:700,fill:C.red,anchor:tx>285?'end':'start',cls:'halo'});
        if(s.searchK>0){const Q=mult[s.searchK],[X,Y]=gr.pos(Q);g+=`<circle cx="${X}" cy="${Y}" r="9" fill="${s.found?C.green:C.purple}" stroke="#29323c" stroke-width="2"/>`;}
        const [gx,gy]=gr.pos(c.G);g+=`<circle cx="${gx}" cy="${gy}" r="7" fill="#f3bc59" stroke="#29323c" stroke-width="2"/>`+t(gx+12,gy<80?gy+30:gy-10,'G',{size:14,weight:700,cls:'halo'});
        g+=t(285,555,s.found?`Found it: d = ${s.searchK}`:s.searchK?`Trying d = ${s.searchK} …`:'Can you find d with P = d·G?',{size:15,anchor:'middle',weight:700,fill:s.found?C.green:C.ink});
        /* scale-up chart */
        const b=s.bits,fwd=1.5*b,rho=2**(b/2),brute=2**(b-1),rate=1e12,yr=[1,1e80],x=600,y=110,w=320,h=320;
        const ly=v=>y+h-Math.log10(Math.max(1,v))/80*h;
        [[fwd,['Wallet','(d·G)'],C.green],[rho,['Best','attack √n'],C.orange],[brute,['Try every','key'],C.red]].forEach(([v,lab,col],i)=>{const X=x+10+i*120,Y=ly(v);g+=`<rect x="${X}" y="${Y}" width="80" height="${y+h-Y}" rx="3" fill="${col}" opacity=".85"/>`+t(X+40,Y-10,sci(v,1),{size:12,anchor:'middle',weight:700,cls:'halo'})+t(X+40,y+h+28,lab[0],{size:11,anchor:'middle',fill:C.muted,weight:600})+t(X+40,y+h+54,lab[1],{size:11,anchor:'middle',fill:C.muted});});
        [0,20,40,60,80].forEach(e=>{g+=`<line x1="${x-8}" x2="${x+w}" y1="${ly(10**e)}" y2="${ly(10**e)}" stroke="#ece6d8"/>`+t(x-12,ly(10**e)+6,e?'10'+K.sup(e):'1',{size:10,anchor:'end',fill:C.muted});});
        g+=t(x-50,30,'GROUP OPERATIONS NEEDED',{size:12,weight:700,fill:C.muted})+t(x-50,58,`${b}-bit key · log scale`,{size:12,fill:C.muted});
        const years=rho/rate/3.15576e7;
        layer.textContent='Discrete logarithm · brute force vs. scale';status.textContent=`toy search at p = 67 · n = ${c.n}`;
        aside.innerHTML=K.asideBlock({title:'Forward is a few hundred steps. Backward is astronomical.',text:`On the toy curve a computer finds d instantly: there are only ${c.n} candidates. Every extra key bit doubles the candidates but adds only one doubling (and on average half an addition) for the wallet.`,
          takeaway:'Security comes from the gap between the two curves of effort, not from hiding the algorithm.',
          stats:K.readouts([['Key size',`${b} bits`],['Wallet operations',`≈ ${fmt(fwd)}`,'good'],['Best generic attack',`≈ ${sci(rho,1)} steps`,'bad'],['Best attack at 10¹² steps/s',years<1?K.duration(rho/rate/60):`${sci(years,1)} years`,'bad']]),
          tries:['Run the brute-force search on the toy curve. Count the tries.','Raise the key size to 64, 128, 256 bits. Watch the bars separate.','Compare 2¹²⁸ steps with the age of the universe (≈ 1.4 × 10¹⁰ years).']});
        return svg(960,575,g,'Brute-force search for a toy private key and a log-scale comparison of effort');
      }
      function draw(){
        let out=s.view==='real'?drawReal():s.view==='clock'?drawClock():drawOneway();
        scene.innerHTML=out;const note=controls.querySelector('#search-note');if(note)note.textContent=s.found?`${s.searchK} tries`:'';
      }
      main.querySelectorAll('.demo-tab').forEach(b=>b.addEventListener('click',()=>{s.view=b.dataset.value;main.querySelectorAll('.demo-tab').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));if(stopAnim){stopAnim();stopAnim=null;}if(s.view==='oneway'){newTarget();}else{c=curve(s.field);mult=multiples(c);}buildControls();draw();}));
      buildControls();draw();
      this.state=()=>({...s,n:c.n});
      return()=>{if(stopAnim)stopAnim();};
    }});
})(typeof window!=='undefined'?window:globalThis);

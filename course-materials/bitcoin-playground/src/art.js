/* Original SVG illustrations. Shared primitives keep future toys visually related. */
(function(root){
  'use strict';
  const ink='#29323c', colors={purple:'#8256d8',blue:'#3177c8',green:'#47965d',orange:'#db901e',red:'#ce5750'};
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text=(x,y,s,cls='label',extra='')=>`<text x="${x}" y="${y}" class="${cls}" ${extra}>${esc(s)}</text>`;
  const lines=(x,y,items,cls='label',gap=25)=>items.map((s,i)=>text(x,y+i*gap,s,cls)).join('');
  function defs(){return `<defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1 9 5 1 9" fill="none" stroke="context-stroke" stroke-width="1.8" stroke-linejoin="round"/></marker>
    <linearGradient id="screen" x2="0" y2="1"><stop stop-color="#f3faff"/><stop offset="1" stop-color="#cce3f4"/></linearGradient>
    <linearGradient id="paper" x2="0" y2="1"><stop stop-color="#fffef8"/><stop offset="1" stop-color="#fbf1d9"/></linearGradient>
    <symbol id="cube" viewBox="0 0 64 68"><path d="M5 17 34 4 60 17 31 31Z" fill="#9dd2f4"/><path d="M5 17 31 31 31 62 5 48Z" fill="#69aee4"/><path d="M31 31 60 17 60 49 31 62Z" fill="#398ecf"/><path d="M5 17 34 4 60 17 60 49 31 62 5 48Z M5 17 31 31 60 17 M31 31V62" fill="none" stroke="${ink}" stroke-width="2.5" stroke-linejoin="round"/></symbol>
    <symbol id="slip" viewBox="0 0 48 60"><path d="M5 3H32L44 15V56H5Z" fill="#ede3ff" stroke="${ink}" stroke-width="2.2" stroke-linejoin="round"/><path d="M32 3V15H44" fill="#cdb4f1" stroke="${ink}" stroke-width="2"/><text x="24" y="35" font-size="23" text-anchor="middle" fill="#7543c1" font-family="Arial" font-weight="700">A</text><path d="M12 44H34M12 49H29" stroke="#9d76d7" stroke-width="2" stroke-linecap="round"/></symbol>
  </defs>`;}
  function svg(content,title='Bitcoin transaction journey'){return `<svg class="scene-svg" viewBox="0 0 1080 500" role="img" aria-label="${esc(title)}" xmlns="http://www.w3.org/2000/svg">${defs()}${content}</svg>`;}
  function arrow(id,d,color='blue',dashed=false){return `<path id="${id}" d="${d}" fill="none" stroke="${colors[color]||color}" stroke-width="2.6" stroke-linecap="round" ${dashed?'stroke-dasharray="7 7"':''} marker-end="url(#arrow)"/>`;}
  function packet(path,delay=0,type='tx',dur=1.7){return `<g class="traveller" opacity="0"><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.03;0.94;1" dur="${dur}s" begin="${delay}s" fill="freeze"/><animateMotion dur="${dur}s" begin="${delay}s" fill="freeze"><mpath href="#${path}"/></animateMotion>${type==='tx'?'<use href="#slip" x="-17" y="-22" width="34" height="43"/>':`<rect x="-17" y="-17" width="34" height="34" rx="4" fill="#f8d277" stroke="${ink}" stroke-width="2"/>`}</g>`;}
  function tx(x,y,scale=1){return `<use href="#slip" x="${x}" y="${y}" width="${48*scale}" height="${60*scale}"/>`;}
  function node(x,y,{label='',scale=1,check='',active=true}={}){return `<g transform="translate(${x} ${y}) scale(${scale})" opacity="${active?1:.4}">
    <ellipse cx="52" cy="97" rx="61" ry="7" fill="#e2ddcf"/>
    <rect x="3" y="2" width="96" height="68" rx="7" fill="#aab7ca" stroke="${ink}" stroke-width="2.8"/>
    <rect x="10" y="9" width="82" height="53" rx="2" fill="url(#screen)" stroke="${ink}" stroke-width="1.8"/>
    <use href="#cube" x="33" y="17" width="38" height="41"/>
    <path d="M43 71V81H24V86H78V81H60V71" fill="#8795a6" stroke="${ink}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M-2 88H104L111 96H-8Z" fill="#cbd5df" stroke="${ink}" stroke-width="2"/><path d="M8 91H91" stroke="#7c8795" stroke-width="2" stroke-dasharray="5 3"/>
    ${label?text(52,122,label,'small-label','text-anchor="middle"'):''}
    ${check?`<circle cx="111" cy="13" r="14" fill="${check==='yes'?'#e9f5df':'#fce4df'}" stroke="${check==='yes'?colors.green:colors.red}" stroke-width="2"/>${text(111,19,check==='yes'?'✓':'×','check-mark','text-anchor="middle"')}`:''}
  </g>`;}
  function person(x,y,{shirt='#95bd79',miner=false,scale=1}={}){return `<g transform="translate(${x} ${y}) scale(${scale})" stroke="${ink}" stroke-width="2.7" stroke-linejoin="round" stroke-linecap="round">
    <ellipse cx="63" cy="172" rx="63" ry="9" fill="#e3decf" stroke="none"/>
    <path d="M22 73Q3 85 8 153L80 164 103 112 87 82Z" fill="${shirt}"/>
    <path d="M41 57 38 83Q55 98 68 78L66 61" fill="#f1c695"/>
    <path d="M32 15Q4 29 19 76L35 81 74 68 86 43Q91 9 58 7Z" fill="#885b35"/>
    <path d="M34 29Q45 43 75 25L77 59Q69 80 51 76L30 61 26 42Z" fill="#f3cea0"/>
    <path d="M29 42Q18 33 21 48L30 53" fill="#f3cea0"/>
    <path d="M61 52 67 56 60 58M48 65Q57 71 64 64" fill="none" stroke-width="2"/>
    <path d="M46 46V49M68 44V47" stroke-width="3.4"/>
    ${miner?'<path d="M22 28Q25 0 54 1 81 0 85 26L93 31 17 35Z" fill="#f2bc4b"/><path d="M46 6 45 25M62 4 64 24" fill="none" stroke="#b68626"/>':''}
    <path d="M23 105 43 133 78 116 84 131Q47 160 32 146L14 124" fill="${shirt}"/>
    <path d="M77 114Q84 103 90 109L99 118 85 133 76 130Z" fill="#f3cea0"/>
    ${miner?'<path d="M83 102 117 84 135 117 96 136Z" fill="#abb7c8"/><path d="M96 104 120 105M104 117 113 97" stroke="#dd961f" stroke-width="4"/>':'<path d="M86 71 111 77 102 121 77 115Z" fill="#677891"/><path d="M89 77 105 81 99 109 83 105Z" fill="#c6e4f6"/><circle cx="94" cy="91" r="4" fill="#aa80e0" stroke-width="1.5"/>'}
  </g>`;}
  function tray(x,y,slips=['A','B','C'],scale=1){return `<g transform="translate(${x} ${y}) scale(${scale})"><path d="M5 30 20 3H130L146 31V65H5Z" fill="#d8e6e8" stroke="${ink}" stroke-width="2.5" stroke-linejoin="round"/>
    ${slips.map((s,i)=>`<g transform="translate(${14+i*34} ${s==='A'?5:9}) rotate(${i%2?3:-3})"><path d="M0 0H29V46H0Z" fill="${s==='A'?'#e6d7ff':i%2?'#ffdc81':'#c7e2ac'}" stroke="${ink}" stroke-width="2"/>${text(14,28,s,'note-letter','text-anchor="middle"')}</g>`).join('')}
    <path d="M4 32 16 57H135L147 31 143 70H8Z" fill="#b9d9e1" stroke="${ink}" stroke-width="2.4" stroke-linejoin="round"/>${text(76,63,'MEMPOOL','tray-label','text-anchor="middle"')}</g>`;}
  function block(x,y,{label='BLOCK',color='#f2cf77',scale=1,withTx=false}={}){return `<g transform="translate(${x} ${y}) scale(${scale})" stroke="${ink}" stroke-width="2.5" stroke-linejoin="round">
    <path d="M0 20 30 3 123 11 97 29Z" fill="#ffedb9"/><path d="M97 29 123 11 123 113 97 135Z" fill="#d5ab54"/><path d="M0 20 97 29 97 135 0 119Z" fill="${color}"/>
    <path d="M14 45 79 51M14 55 79 61" stroke="#997328" stroke-width="2"/>
    ${withTx?'<use href="#slip" x="24" y="64" width="38" height="47"/>':`<path d="M15 73 37 76 37 99 15 96Z M51 78 75 81 75 104 51 101Z" fill="#fff3cd" stroke-width="1.7"/>`}
    ${text(49,158,label,'small-label','stroke="none" text-anchor="middle"')}
  </g>`;}
  function miner(x,y,scale=1){return `<g transform="translate(${x} ${y}) scale(${scale})">${person(0,-10,{miner:true,shirt:'#efa552',scale:.78})}<g transform="translate(81 88)" stroke="${ink}" stroke-width="2.5"><path d="M0 0 18 -12 85 -3 70 12 70 60 0 48Z" fill="#7e899b" stroke-linejoin="round"/><path d="M0 0 70 12 85 -3 85 46 70 60M70 12V60" fill="none"/>${[19,48].map(a=>`<circle cx="${a}" cy="26" r="11" fill="#424d5f"/><path d="M${a-7} 22  ${a+7} 30M${a+6} 19 ${a-6} 33" stroke="#b5c1d1"/>`).join('')}</g></g>`;}
  function caption(s){return text(540,474,s,'scene-caption','text-anchor="middle"');}
  function overview(){
    let out='';
    const headings=[[94,'Wallet','purple'],[318,'Peers','blue'],[520,'Mempools','green'],[730,'Miners','orange'],[974,'Full nodes','green']];
    out+=headings.map(([x,s,c],i)=>`<circle cx="${x}" cy="39" r="14" fill="${colors[c]}"/>${text(x,44,i+1,'stage-number','text-anchor="middle"')}${text(x,79,s,'hand-label','text-anchor="middle"')}`).join('');
    out+=arrow('o1','M168 244C194 244 197 225 227 224','blue');
    [[280,165],[381,235],[278,315],[371,371]].forEach(([x,y],i)=>{out+=node(x-40,y-32,{scale:.69});});
    out+=arrow('o2','M310 180L373 220','blue')+arrow('o3','M376 270L314 310','blue')+arrow('o4','M279 277V223','blue')+arrow('o5','M315 346L367 373','blue');
    out+=person(36,103,{scale:.8})+person(57,305,{scale:.65,shirt:'#75a9d1'})+tx(101,249,.7);
    [127,242,357].forEach((y,i)=>{out+=arrow('om'+i,`M426 ${y+45}Q446 ${y+22} 473 ${y+25}`,'blue',true);out+=node(495,y-20,{scale:.52});out+=tray(474,y+40,i===1?['C','A']:['A','B','C'],.65);out+=arrow('mm'+i,`M580 ${y+62}Q605 ${y+64} 633 ${y+57}`,'orange',true);out+=miner(634,y-21,.68);});
    out+=arrow('win','M762 241H823','orange',true)+block(812,174,{withTx:true,scale:.65,label:'Found block'});
    [123,252,381].forEach((y,i)=>{out+=arrow('verify'+i,`M901 237Q922 ${y+35} 949 ${y+35}`,'green');out+=node(945,y,{scale:.62,check:'yes'});});
    out+=packet('o1',.2)+packet('o2',1.3)+packet('om1',2.1)+packet('mm1',3)+packet('win',4,'block')+packet('verify1',5,'block');
    return svg(out+caption('A payment becomes history through local checks and accumulated work.'));
  }
  function wallet(){return svg(`
    ${person(38,162,{scale:1.25})}${text(118,408,'ALICE','hand-label','text-anchor="middle"')}
    ${arrow('w1','M222 254H284','purple')}
    <g class="appear"><rect x="305" y="91" width="205" height="289" rx="11" fill="url(#paper)" stroke="${ink}" stroke-width="2.4"/>
    ${text(328,128,'ONE INPUT','hand-label')}${text(328,174,'100,000 sats','big-number')}${lines(328,209,['Unspent output','prior-tx:0'],'small-label',22)}
    <path d="M328 246H488" stroke="#d2c9b6"/>${text(328,280,'AUTHORIZED','small-label')}
    <g transform="translate(335 304)" stroke="#8256d8" stroke-width="3" fill="#e7d9fd"><circle cx="14" cy="14" r="14"/><path d="M29 8H83L91 16 83 24 75 18 69 24 62 18H29Z"/><circle cx="10" cy="14" r="3"/></g></g>
    ${arrow('w2','M532 230H591','purple')}${tx(541,151,1)}
    <rect x="616" y="91" width="234" height="125" rx="11" fill="#e9f2e1" stroke="${ink}" stroke-width="2.4"/>
    ${text(639,127,'BOB’S OUTPUT','hand-label')}${text(639,173,'60,000 sats','big-number')}
    <rect x="616" y="237" width="234" height="95" rx="11" fill="#eef0f9" stroke="${ink}" stroke-width="2.4"/>
    ${text(639,272,'CHANGE TO ALICE','hand-label')}${text(639,309,'39,000 sats','medium-number')}
    ${text(626,373,'Fee = 1,000 sats','small-label')}
    ${person(892,163,{shirt:'#7eadd2',scale:1.12})}${text(962,398,'BOB','hand-label','text-anchor="middle"')}
    ${packet('w1',.1)}${packet('w2',1.7)}${caption('100,000 in = 60,000 payment + 39,000 change + 1,000 fee')}
  `,'Alice authorizes a transaction spending 100,000 sats, paying Bob 60,000 and returning 39,000 as change, with a 1,000 sat fee.');}
  function relay(){let out=person(32,158,{scale:1.1})+text(100,394,'ALICE','hand-label','text-anchor="middle"');
    const positions=[[285,193],[555,80],[553,307],[866,191]];
    [['r0','M195 252H276'],['r1','M401 211Q462 117 547 125'],['r2','M402 255Q462 352 546 352'],['r3','M672 128Q790 128 858 217'],['r4','M671 353Q784 365 857 262']].forEach(([id,d],i)=>{out+=arrow(id,d,i===2||i===4?'#c6c9c8':'blue',i>0);if(i!==2&&i!==4)out+=packet(id,i*.85);});
    positions.forEach(([x,y],i)=>{out+=node(x,y,{label:`NODE ${i+1}`,check:i===2?'':'yes',active:i!==2});if(i!==2)out+=tx(x+111,y+44,.56);});
    out+=text(485,222,'announce','small-label')+text(494,251,'request','small-label')+text(477,280,'send transaction','small-label');
    return svg(out+caption('Each receiver checks the transaction before accepting and relaying it.'));}
  function mempools(state){let out='';const nodes=[[237,58],[690,58],[237,270],[690,270]];
    out+=arrow('m0','M406 153H665','blue')+arrow('m1','M685 351H422','blue')+arrow('m2','M345 252V225','blue');
    nodes.forEach(([x,y],i)=>{out+=`<g class="check-row" style="animation-delay:${i*.25}s"><rect x="${x-24}" y="${y-8}" width="206" height="173" rx="20" fill="#edf3e5" stroke="#bfd2b0" stroke-width="1.4"/>`;out+=node(x+35,y,{scale:.56});out+=text(x+5,y+70,'NODE '+(i+1),'small-label');out+=tray(x+2,y+83,state.mempools[i],.98)+'</g>';});
    out+=text(530,90,'LOCAL VIEWS','hand-label','text-anchor="middle"');
    return svg(out+caption('Purple A is Alice’s payment. Node 3 has not received it in this snapshot.'));}
  function candidate(){return svg(`
    ${node(81,74,{label:'MINER’S NODE',scale:.9})}${tray(57,218,['A','B','C'],1.2)}
    ${arrow('c1','M250 276H337','orange')}${packet('c1',.3)}
    ${miner(333,125,1.2)}${text(425,369,'SELECT + ORDER','hand-label','text-anchor="middle"')}
    ${arrow('c2','M533 244H609','orange')}${packet('c2',1.7)}
    <g class="appear"><rect x="637" y="45" width="359" height="377" rx="16" fill="#fffef9" stroke="${ink}" stroke-width="2.5"/>
    ${text(662,82,'CANDIDATE BLOCK','hand-label')}
    <rect x="658" y="102" width="317" height="110" rx="8" fill="#e3effa" stroke="#5e91c9" stroke-width="1.8"/>
    ${text(679,131,'80-BYTE HEADER','label')}${lines(679,163,['version · previous block hash','Merkle root · time · nBits · nonce'],'small-label',23)}
    <rect x="658" y="231" width="317" height="39" rx="6" fill="#f9e5b5"/>
    ${text(675,256,'1   coinbase: subsidy + fees','small-label')}
    <rect x="658" y="280" width="317" height="51" rx="6" fill="#eadefb" stroke="#9d7cce" stroke-width="1.5"/>
    ${text(675,311,'2   TX A: Alice pays Bob','label')}
    <rect x="658" y="341" width="317" height="39" rx="6" fill="#f1efea"/>${text(675,367,'3   TX B: another payment','small-label')}
    ${text(680,406,'Transaction order is committed.','small-label')}</g>
    ${caption('The coinbase comes first. Parents must precede transactions that spend them.')}
  `);}
  function mining(trials){const last=trials.at(-1);return svg(`
    ${miner(90,152,1.5)}${text(226,409,'MANY ATTEMPTS','hand-label','text-anchor="middle"')}
    ${arrow('h1','M379 278H453','orange')}
    <rect x="485" y="69" width="481" height="336" rx="15" fill="#fffefb" stroke="${ink}" stroke-width="2.5"/>
    ${text(513,107,'80-BYTE TOY HEADER','hand-label')}${text(513,145,'nonce','small-label')}${text(596,145,last.nonce,'mono hash-nonce')}
    <path d="M513 167H938" stroke="#d7cfbf"/>
    ${text(513,198,'DOUBLE SHA-256','small-label')}${text(513,234,last.hash.slice(0,28),'mono hash-display')}${text(513,262,last.hash.slice(28),'mono hash-tail')}
    ${text(513,306,'target  0fffff'+'0'.repeat(10)+'…','mono')}
    <rect x="513" y="335" width="425" height="44" rx="7" fill="#e6f0dc"/>
    ${text(532,363,'✓  Hash ≤ target: proof of work found','label hash-verdict')}
    ${caption('Real SHA256d; illustrative header and easy target. No Bitcoin network is involved.')}
  `);}
  function blockRelay(){let out=miner(29,161,1.05)+block(229,192,{withTx:true,scale:.65,label:'Found block'});
    const coords=[[459,194],[717,57],[718,337],[924,196]];
    [['br0','M327 245H439'],['br1','M554 215Q620 107 706 104'],['br2','M554 274Q620 383 705 383'],['br3','M817 107Q900 118 929 188'],['br4','M819 380Q900 366 928 310']].forEach(([id,d],i)=>{out+=arrow(id,d,'blue',true)+packet(id,i*.8,'block');});
    coords.forEach(([x,y],i)=>{out+=node(x,y,{label:'NODE '+(i+1),scale:.84});out+=block(x+75,y+57,{withTx:true,scale:.25,label:''});});
    return svg(out+caption('The block is received at different times. Its contents still need validation.'));}
  function verify(state){return svg(`
    ${block(77,147,{withTx:true,color:state.invalid?'#ef9b8d':'#cfdda8',scale:1.24,label:state.invalid?'UNAUTHORIZED SPEND':'FOUND BLOCK'})}
    <circle cx="218" cy="178" r="28" fill="#f5cf6a" stroke="${ink}" stroke-width="2.2"/>${text(218,184,'PoW','label','text-anchor="middle"')}
    ${arrow('v1','M265 250H327',state.invalid?'red':'green')}
    <path d="M352 368V165a126 126 0 0 1 252 0V368Z" fill="#e4dfd5" stroke="${ink}" stroke-width="3"/>
    <path d="M380 368V169a98 98 0 0 1 196 0V368Z" fill="#fffdf8" stroke="${ink}" stroke-width="2.4"/>
    ${text(478,170,'CONSENSUS','hand-label','text-anchor="middle"')}${text(478,200,'CHECKS','hand-label','text-anchor="middle"')}
    ${state.checks.map((c,i)=>`<g class="check-row" style="animation-delay:${i*.45}s"><circle cx="397" cy="${235+i*31}" r="8" fill="${c.ok?'#e1efd5':'#f8d4ce'}"/>${text(397,240+i*31,c.ok?'✓':'×','tiny-check','text-anchor="middle"')}${text(415,240+i*31,['Header & PoW','Commitments','Authorization','Limits & reward'][i],'gate-label')}</g>`).join('')}
    ${arrow('v2','M631 250H710',state.invalid?'red':'green')}
    ${node(777,143,{scale:1.3,check:state.invalid?'no':'yes'})}
    <rect x="740" y="318" width="238" height="57" rx="9" fill="${state.invalid?'#f8d6cd':'#deedd0'}" stroke="${state.invalid?colors.red:colors.green}" stroke-width="2"/>
    ${text(859,354,state.invalid?'REJECT BLOCK':'VALID BLOCK','hand-label','text-anchor="middle"')}
    ${caption(state.invalid?'Even valid proof of work cannot authorize an invalid spend.':'The same rules are checked independently by every full node.')}
  `);}
  function chain(state){
    const small=(x,y,label,color,withTx=false)=>block(x,y,{label,color,withTx,scale:.47});
    let out=text(93,221,'SHARED PAST','small-label')+small(86,245,'', '#d0d4d7')+small(184,245,'','#d0d4d7');
    out+=arrow('ch0','M147 280H179','#8a9196')+arrow('ch1','M247 271Q281 271 302 166',state.reorg?'#b7b3a9':'green');
    const count=1+state.descendants;
    for(let i=0;i<count;i++){const x=310+i*122;out+=small(x,128,i===0?'TX A':'+'+i,state.reorg?'#d4d6cb':'#a9cb82',i===0);if(i<count-1)out+=arrow('cha'+i,`M${x+62} 163H${x+114}`,state.reorg?'#b7b3a9':'green');}
    out+=text(310,87,state.reorg?'FORMER ACTIVE BRANCH':'ACTIVE BRANCH','hand-label');
    out+=text(310,239,`${count} confirmation${count===1?'':'s'} before any reorganization`,'small-label');
    if(state.reorg){out+=arrow('fork','M247 293Q279 293 302 335','red');for(let i=0;i<count+1;i++){const x=310+i*122;out+=small(x,304,'','#edaa89');if(i<count)out+=arrow('chr'+i,`M${x+62} 339H${x+114}`,'red');}out+=text(310,290,'NEW ACTIVE BRANCH: MORE WORK','hand-label');out+=text(310,408,'TX A is absent here. Its input is still unspent in this example.','small-label');}
    else{out+=`<path d="M249 293Q279 329 312 344H580" fill="none" stroke="#c9c3b6" stroke-width="2" stroke-dasharray="6 7"/>`;out+=text(320,382,'A competing valid branch can appear.','small-label');}
    out+=caption(state.reorg?'The reorganization removes TX A’s confirmations. In this example it returns to the mempool.':'Each later block adds work above Alice’s payment. Reversal risk remains nonzero.');return svg(out);
  }
  function render(state){return [overview,wallet,relay,()=>mempools(state),candidate,()=>mining(root.PlaygroundProtocol.trials),blockRelay,()=>verify(state),()=>chain(state)][state.step]();}
  root.PlaygroundArt={render,overview,esc,colors};
})(typeof window!=='undefined'?window:globalThis);

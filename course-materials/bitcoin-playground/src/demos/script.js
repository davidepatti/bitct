/* Tool · Script stack machine: step through unlocking + locking scripts with symbolic keys and signatures. */
(function(root){
  'use strict';
  const P=root.PlaygroundProtocol||(typeof require!=='undefined'?require('../protocol.js'):null);
  const NAMES={A:'Alice',B:'Bob',C:'Carol',M:'Mallory'};
  /* Toy items. Hashes are real SHA-256 of a label, shortened for display; keys and signatures are symbolic. */
  const h=(label)=>({t:'hash',v:P.hex(P.sha256(new TextEncoder().encode(label))).slice(0,8)});
  const pk=w=>({t:'pk',who:w}),sig=(w,ok=true)=>({t:'sig',who:w,ok}),num=v=>({t:'num',v}),bytes=v=>({t:'bytes',v});
  const show=x=>x.t==='pk'?`PK ${NAMES[x.who]}`:x.t==='sig'?`sig ${NAMES[x.who]}${x.ok?'':' (forged)'}`:x.t==='hash'?x.v:x.t==='num'?String(x.v):x.t==='bytes'?`“${x.v}”`:x.t==='bool'?(x.v?'1 (true)':'0 (false)'):'?';
  const truthy=x=>x&&!(x.t==='bool'&&!x.v)&&!(x.t==='num'&&x.v===0);
  const hashOf=x=>x.t==='pk'?h('pk:'+x.who):x.t==='bytes'?h('b:'+x.v):h('x:'+show(x));
  const eq=(a,b)=>a&&b&&a.t===b.t&&JSON.stringify(a)===JSON.stringify(b);
  const PUSH=(v)=>({op:'PUSH',v}),OP=o=>({op:o});
  const TEMPLATES={
    p2pkh:{label:'Pay to public key hash',lock:[OP('OP_DUP'),OP('OP_HASH160'),PUSH(hashOf(pk('A'))),OP('OP_EQUALVERIFY'),OP('OP_CHECKSIG')],
      cases:{ok:{label:'Alice signs',unlock:[PUSH(sig('A')),PUSH(pk('A'))]},wrongkey:{label:'Bob uses his key',unlock:[PUSH(sig('B')),PUSH(pk('B'))]},forged:{label:'Mallory copies Alice’s key',unlock:[PUSH(sig('M',false)),PUSH(pk('A'))]}}},
    multi:{label:'2-of-3 multisig',lock:[OP('OP_2'),PUSH(pk('A')),PUSH(pk('B')),PUSH(pk('C')),OP('OP_3'),OP('OP_CHECKMULTISIG')],
      cases:{ok:{label:'Alice + Carol sign',unlock:[OP('OP_0'),PUSH(sig('A')),PUSH(sig('C'))]},one:{label:'Only Alice signs',unlock:[OP('OP_0'),PUSH(sig('A'))]},order:{label:'Signatures out of order',unlock:[OP('OP_0'),PUSH(sig('C')),PUSH(sig('A'))]},nodummy:{label:'Forget the extra OP_0',unlock:[PUSH(sig('A')),PUSH(sig('C'))]}}},
    hashlock:{label:'Hash lock',lock:[OP('OP_SHA256'),PUSH(hashOf(bytes('open sesame'))),OP('OP_EQUAL')],
      cases:{ok:{label:'Reveal the secret',unlock:[PUSH(bytes('open sesame'))]},wrong:{label:'Guess wrong',unlock:[PUSH(bytes('open sesamE'))]}}},
    timelock:{label:'Timelock (CLTV)',lock:[PUSH(num(800000)),OP('OP_CHECKLOCKTIMEVERIFY'),OP('OP_DROP'),PUSH(pk('A')),OP('OP_CHECKSIG')],
      cases:{ok:{label:'nLockTime 800,000',unlock:[PUSH(sig('A'))],locktime:800000},early:{label:'nLockTime 799,000',unlock:[PUSH(sig('A'))],locktime:799000}}},
    htlc:{label:'Hash OR timeout (IF/ELSE)',lock:[OP('OP_IF'),OP('OP_SHA256'),PUSH(hashOf(bytes('open sesame'))),OP('OP_EQUALVERIFY'),PUSH(pk('B')),OP('OP_ELSE'),PUSH(num(800000)),OP('OP_CHECKLOCKTIMEVERIFY'),OP('OP_DROP'),PUSH(pk('A')),OP('OP_ENDIF'),OP('OP_CHECKSIG')],
      cases:{bob:{label:'Bob with the secret',unlock:[PUSH(sig('B')),PUSH(bytes('open sesame')),OP('OP_1')]},bobwrong:{label:'Bob, wrong secret',unlock:[PUSH(sig('B')),PUSH(bytes('guess')),OP('OP_1')]},refund:{label:'Alice refund after timeout',unlock:[PUSH(sig('A')),OP('OP_0')],locktime:800000},early:{label:'Alice refund too early',unlock:[PUSH(sig('A')),OP('OP_0')],locktime:790000}}}
  };
  const EXPLAIN={PUSH:'Push data onto the stack.',OP_0:'Push 0 (an empty value, false).',OP_1:'Push 1 (true).',OP_2:'Push the number 2.',OP_3:'Push the number 3.',OP_DUP:'Duplicate the top item.',OP_HASH160:'Replace the top item with its hash (HASH160).',OP_SHA256:'Replace the top item with its SHA-256 hash.',OP_EQUAL:'Pop two items; push 1 if they are equal, else 0.',OP_EQUALVERIFY:'Pop two items; stop with failure unless they are equal.',OP_CHECKSIG:'Pop a public key and a signature; push 1 if the signature is valid for this transaction and key.',OP_CHECKMULTISIG:'Pop n keys and m signatures (plus one extra item, a historic off-by-one); push 1 if each signature matches a later key, in order.',OP_CHECKLOCKTIMEVERIFY:'Fail unless the transaction’s nLockTime is at least the number on top (the item stays).',OP_DROP:'Remove the top item.',OP_IF:'Pop the top item; run the IF branch if it is true, otherwise the ELSE branch.',OP_ELSE:'Switch branches.',OP_ENDIF:'End of the conditional.'};
  /* Execute unlocking then locking script. Returns a trace with one frame per token. */
  function run(template,caseId){
    const T=TEMPLATES[template],c=T.cases[caseId],tokens=[...c.unlock.map(x=>({...x,part:'unlock'})),...T.lock.map(x=>({...x,part:'lock'}))],tx={locktime:c.locktime||0};
    const stack=[],exec=[],frames=[];let error=null;
    const pop=()=>{if(!stack.length)throw new Error('stack is empty');return stack.pop();};
    for(let i=0;i<tokens.length&&!error;i++){
      const tk=tokens[i],active=exec.every(Boolean),flow=['OP_IF','OP_ELSE','OP_ENDIF'].includes(tk.op);let note=EXPLAIN[tk.op]||'';
      try{
        if(!active&&!flow){frames.push({i,stack:stack.slice(),note:'Skipped: this branch is not taken.',skipped:true});continue;}
        switch(tk.op){
          case 'PUSH':stack.push(tk.v);break;
          case 'OP_0':stack.push({t:'bool',v:false});break;case 'OP_1':stack.push({t:'bool',v:true});break;
          case 'OP_2':stack.push(num(2));break;case 'OP_3':stack.push(num(3));break;
          case 'OP_DUP':{const x=pop();stack.push(x,x);break;}
          case 'OP_HASH160':case 'OP_SHA256':stack.push(hashOf(pop()));break;
          case 'OP_EQUAL':{const a=pop(),b=pop();stack.push({t:'bool',v:eq(a,b)});break;}
          case 'OP_EQUALVERIFY':{const a=pop(),b=pop();if(!eq(a,b))throw new Error(`${show(b)} ≠ ${show(a)}`);note+=' They match.';break;}
          case 'OP_CHECKSIG':{const k=pop(),s=pop();const ok=k.t==='pk'&&s.t==='sig'&&s.ok&&s.who===k.who;stack.push({t:'bool',v:ok});note+=ok?' Valid.':` Invalid: ${s.t!=='sig'?'not a signature':!s.ok?'the signature does not verify':`signed by ${NAMES[s.who]}, not ${NAMES[k.who]}`}.`;break;}
          case 'OP_CHECKMULTISIG':{const n=pop().v,keys=[];for(let j=0;j<n;j++)keys.unshift(pop());const m=pop().v,sigs=[];for(let j=0;j<m;j++)sigs.unshift(pop());pop();
            let k=0,ok=true;for(const s of sigs){while(k<keys.length&&!(s.t==='sig'&&s.ok&&s.who===keys[k].who))k++;if(k>=keys.length){ok=false;break;}k++;}stack.push({t:'bool',v:ok});note+=ok?' Both signatures match keys in order.':' A signature has no matching key after the previous one.';break;}
          case 'OP_CHECKLOCKTIMEVERIFY':{const x=stack.at(-1);if(!x)throw new Error('stack is empty');if(tx.locktime<x.v)throw new Error(`nLockTime ${tx.locktime.toLocaleString('en-US')} < ${x.v.toLocaleString('en-US')}`);note+=` nLockTime ${tx.locktime.toLocaleString('en-US')} ≥ ${x.v.toLocaleString('en-US')}.`;break;}
          case 'OP_DROP':pop();break;
          case 'OP_IF':{const v=active?truthy(pop()):false;exec.push(v);note+=active?(v?' Taking the IF branch.':' Taking the ELSE branch.'):'';break;}
          case 'OP_ELSE':exec[exec.length-1]=!exec[exec.length-1];break;
          case 'OP_ENDIF':exec.pop();break;
        }
      }catch(e){error={at:i,msg:e.message};}
      frames.push({i,stack:stack.slice(),note:error?`Failed: ${error.msg}.`:note,error:!!error});
    }
    const ok=!error&&stack.length>0&&truthy(stack.at(-1));
    return {tokens,frames,ok,error,reason:error?error.msg:!stack.length?'empty stack':!ok?'top of stack is false':'',locktime:tx.locktime};
  }
  const model={TEMPLATES,run,show};
  if(typeof module!=='undefined'&&module.exports){module.exports=model;return;}

  const K=root.PlaygroundKit,{t,svg,colors:C,esc}=K;
  const itemColor=x=>x.t==='sig'?(x.ok?'#e5d8fb':'#f6d6d3'):x.t==='pk'?'#bfdaef':x.t==='hash'?'#f7daa0':x.t==='bool'?(x.v?'#c9e7cf':'#f6d6d3'):x.t==='bytes'?'#e9e5da':'#efeadf';
  K.register({id:'script-machine',number:'09',module:'M 2.1',moduleName:'Transactions',kind:'Script',color:C.blue,
    title:'Script stack machine',
    description:'Step through the unlocking and locking scripts of real output types on an animated stack. Swap in a wrong key, a wrong secret or an early locktime and see exactly where the spend fails.',
    preview(){let g='';[['OP_DUP',70],['OP_HASH160',96],['<h>',44],['OP_EQUAL…',86]].reduce((X,[x,w],i)=>{g+=`<rect x="${X}" y="18" width="${w}" height="26" rx="4" fill="${i===1?'#3177c8':'#f7daa0'}" stroke="#29323c" stroke-width="1"/><text x="${X+w/2}" y="36" font-size="12" text-anchor="middle" font-family="Menlo,monospace" fill="${i===1?'#fff':'#29323c'}">${x.replace('<','&lt;').replace('>','&gt;')}</text>`;return X+w+6;},10);[['PK Alice','#bfdaef'],['PK Alice','#bfdaef'],['sig Alice','#e5d8fb']].forEach(([l,c],i)=>{g+=`<rect x="100" y="${62+i*32}" width="120" height="28" rx="4" fill="${c}" stroke="#29323c" stroke-width="1.2"/><text x="160" y="${81+i*32}" font-size="14" text-anchor="middle" font-family="Arial" fill="#29323c">${l}</text>`;});return `<svg viewBox="0 0 320 168">${g}</svg>`;},
    mount(main,{reduced}){
      const s={tpl:'p2pkh',kase:'ok',pos:0};let tr=run(s.tpl,s.kase),stopAnim=null;
      main.innerHTML=K.page(this,{layer:'Script evaluation · stack machine',
        controls:K.segmented({key:'tpl',label:'Output type',options:Object.entries(TEMPLATES).map(([k,v])=>({value:k,label:v.label})),value:s.tpl})+'<div id="cases" style="grid-column:1/-1"></div><div class="demo-actions"><button id="back">← Back</button><button class="primary" id="step">Step →</button><button id="runall">▶ Run to the end</button><button class="quiet" id="reset">↺ Reset</button><span class="spacer"></span><span class="note" id="snote"></span></div>',
        legend:K.legendItem('#dbe9f6','Unlocking script (spender)')+K.legendItem('#f7ebcc','Locking script (output)')+K.legendItem('#e5d8fb','Signature')+K.legendItem('#bfdaef','Public key')+K.legendItem('#f7daa0','Hash'),
        notes:`<ul><li><strong>Execution.</strong> The spender's unlocking data is pushed first; then the output's locking script runs on the same stack. The spend is valid if no step fails and the final top item is true. (Since 2010, nodes run the two scripts separately and carry the stack over; the result is the same here.)</li><li><strong>Symbols.</strong> Keys and signatures are symbolic: “sig Alice” means a valid signature by Alice's key over this transaction. Hashes are real SHA-256 of a label, shortened to 8 hex digits; HASH160 is shown the same way.</li><li><strong>Output types.</strong> P2PKH, bare 2-of-3 multisig and a bare hash lock are shown as raw scripts. In practice multisig and conditional scripts usually sit behind P2SH, P2WSH or Taproot, which add a step committing to the script's hash; the logic inside is the same. A bare hash lock can be stolen by anyone who sees the secret in the mempool, which is why real HTLCs also require a signature, as in the IF/ELSE example.</li><li><strong>OP_CHECKMULTISIG</strong> pops one more item than it uses (a bug kept for compatibility), so spenders push an extra OP_0. Signatures must appear in the same order as their keys.</li><li><strong>Timelocks.</strong> OP_CHECKLOCKTIMEVERIFY only compares the script's number with the transaction's nLockTime; consensus separately forbids mining a transaction before its nLockTime.</li></ul>`});
      const scene=main.querySelector('#scene'),controls=main.querySelector('#controls'),aside=main.querySelector('#aside'),status=main.querySelector('#scene-status');
      const q=id=>controls.querySelector('#'+id);
      function stop(){if(stopAnim){stopAnim();stopAnim=null;}}
      function cases(){const cs=TEMPLATES[s.tpl].cases;if(!cs[s.kase])s.kase=Object.keys(cs)[0];q('cases').innerHTML=K.segmented({key:'kase',label:'What the spender provides',options:Object.entries(cs).map(([k,v])=>({value:k,label:v.label})),value:s.kase});K.bindControls(q('cases'),s,{},()=>{stop();tr=run(s.tpl,s.kase);s.pos=0;draw();});}
      K.bindControls(controls.querySelector('[data-ctl="tpl"]'),s,{},()=>{stop();cases();tr=run(s.tpl,s.kase);s.pos=0;draw();});
      q('back').onclick=()=>{stop();s.pos=Math.max(0,s.pos-1);draw();};q('step').onclick=()=>{stop();s.pos=Math.min(tr.frames.length,s.pos+1);draw();};q('reset').onclick=()=>{stop();s.pos=0;draw();};
      q('runall').onclick=()=>{stop();if(reduced){s.pos=tr.frames.length;draw();return;}let acc=0;stopAnim=K.loop(dt=>{acc+=dt;if(acc<550)return;acc=0;s.pos++;draw();if(s.pos>=tr.frames.length){stopAnim=null;return false;}});};
      function draw(){
        const fr=s.pos?tr.frames[s.pos-1]:null,cur=s.pos<tr.frames.length?tr.tokens[tr.frames[s.pos]?tr.frames[s.pos].i:s.pos]:null,done=s.pos>=tr.frames.length;let g='';
        /* token strip */
        g+=t(24,28,'UNLOCKING SCRIPT  +  LOCKING SCRIPT',{size:12,weight:700,fill:C.muted});
        let x=24,y=44;tr.tokens.forEach((tk,i)=>{const label=tk.op==='PUSH'?show(tk.v):tk.op,w=Math.max(60,K.tw(label,11.5,true)+24);if(x+w>936){x=24;y+=50;}
          const f=tr.frames.find(F=>F.i===i),executed=f&&tr.frames.indexOf(f)<s.pos,isCur=fr&&fr.i===i,skipped=f&&f.skipped&&executed,failed=fr&&fr.error&&fr.i===i,notReached=!f;
          const base=tk.part==='unlock'?'#dbe9f6':'#f7ebcc';g+=`<rect x="${x}" y="${y}" width="${w}" height="40" rx="7" fill="${failed?'#f6d6d3':isCur?(tk.part==='unlock'?C.blue:C.orange):base}" stroke="${failed?C.red:'#29323c'}" stroke-width="${isCur||failed?2:1}" opacity="${notReached?0.4:skipped?0.45:1}" ${skipped?'stroke-dasharray="4 3"':''}/>`;
          g+=t(x+w/2,y+27,label,{size:11.5,anchor:'middle',cls:'mono',weight:isCur?700:500,fill:isCur&&!failed?'#fff':C.ink});
          if(executed&&!isCur&&!skipped)g+=`<circle cx="${x+w-6}" cy="${y+6}" r="4.5" fill="${C.green}"/>`;x+=w+8;});
        const sy=Math.max(150,y+90);
        /* stack */
        const stack=fr?fr.stack:[],bx=200,by=sy+392;g+=t(bx-155,sy,'STACK (top ↑)',{size:12,weight:700,fill:C.muted});
        g+=`<path d="M${bx-155} ${sy+14}V${by}H${bx+155}V${sy+14}" fill="none" stroke="#bdb6a6" stroke-width="2"/>`;
        stack.forEach((it,k)=>{const Y=by-6-(k+1)*44;if(Y<sy+10)return;g+=`<rect x="${bx-145}" y="${Y}" width="290" height="38" rx="7" fill="${itemColor(it)}" stroke="#29323c" stroke-width="${k===stack.length-1?2:1}"/>`+t(bx,Y+26,show(it),{size:13,anchor:'middle',cls:'mono',weight:k===stack.length-1?700:500});});
        if(!stack.length)g+=t(bx,by-20,'empty',{size:13,anchor:'middle',fill:C.muted});
        /* explanation */
        const ex=400;const lastTok=fr?tr.tokens[fr.i]:null;
        g+=t(ex,sy,s.pos===0?'READY':done?'RESULT':`STEP ${s.pos} OF ${tr.frames.length}`,{size:12,weight:700,fill:C.muted});
        if(lastTok)g+=t(ex,sy+40,lastTok.op==='PUSH'?`push ${show(lastTok.v)}`:lastTok.op,{size:18,weight:700,cls:'mono',fill:fr.error?C.red:C.ink});
        const wrap=(str,max=46)=>{const out=[];let line='';str.split(' ').forEach(w=>{if((line+' '+w).trim().length>max){out.push(line);line=w;}else line=(line+' '+w).trim();});if(line)out.push(line);return out;};
        const lines=wrap(fr?fr.note:'Press “Step” to execute the first instruction.');lines.forEach((l,k)=>{g+=t(ex,sy+80+k*30,l,{size:14,fill:fr&&fr.error?C.red:C.ink});});
        if(done){const dy=sy+80+lines.length*30+10;g+=`<rect x="${ex}" y="${dy}" width="520" height="88" rx="10" fill="${tr.ok?'#e3f1e5':'#f7e1de'}" stroke="${tr.ok?C.green:C.red}" stroke-width="2"/>`+t(ex+18,dy+36,tr.ok?'✓ Valid spend':'✗ Invalid spend',{size:18,weight:700,fill:tr.ok?'#2f7342':C.red})+t(ex+18,dy+70,tr.ok?'The script finished with true on top.':`Reason: ${tr.reason}.`,{size:13});}
        if(tr.locktime)g+=t(ex,by-4,`This transaction’s nLockTime: ${tr.locktime.toLocaleString('en-US')}`,{size:12,fill:C.muted});
        scene.innerHTML=svg(960,by+24,g,'Script tokens, stack and current instruction');
        status.textContent=`${TEMPLATES[s.tpl].label} · ${TEMPLATES[s.tpl].cases[s.kase].label}`;
        q('back').disabled=s.pos===0;q('step').disabled=done;q('snote').textContent=`${s.pos} / ${tr.frames.length}`;
        aside.innerHTML=K.asideBlock({title:done?(tr.ok?'The spend is valid.':'The spend is rejected.'):'A script is a tiny program every node runs.',
          text:done?(tr.ok?'Every node runs exactly these steps and reaches the same answer. No one decides; the program does.':`Execution stopped: ${tr.reason}. Every validating node would reject this transaction in the same way.`):'The output says how it may be spent (locking script). The spender supplies data (unlocking script). Nodes run both on a stack and accept the spend only if the result is true.',
          takeaway:'Ownership in Bitcoin means being able to satisfy a script — usually by producing a signature.',
          stats:K.readouts([['Output type',TEMPLATES[s.tpl].label,'wide'],['Instructions',tr.tokens.length],['Result',done?(tr.ok?'valid':'invalid'):'…',done?(tr.ok?'good':'bad'):'']]),
          tries:['P2PKH: compare “Alice signs” with “Mallory copies Alice’s key”.','Multisig: put the signatures out of order.','IF/ELSE: watch which branch is skipped for Bob and for Alice.','Timelock: why does 799,000 fail even with a valid signature?']});
      }
      cases();draw();
      this.state=()=>({tpl:s.tpl,kase:s.kase,pos:s.pos,ok:tr.ok,reason:tr.reason});
      return stop;
    }});
})(typeof window!=='undefined'?window:globalThis);

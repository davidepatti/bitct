'use strict';
/* Model checks for the interactive demos: known values, conservation laws and Monte Carlo agreement. */
const test=require('node:test');
const assert=require('node:assert/strict');
const curve=require('../src/demos/curve.js');
const coins=require('../src/demos/coins.js');
const mempool=require('../src/demos/mempool.js');
const merkle=require('../src/demos/merkle.js');
const diff=require('../src/demos/difficulty.js');
const pool=require('../src/demos/pool.js');
const race=require('../src/demos/race.js');
const forks=require('../src/demos/forks.js');
const multisig=require('../src/demos/multisig.js');
const routing=require('../src/demos/routing.js');
function rng(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
const close=(a,b,tol,msg)=>assert.ok(Math.abs(a-b)<=tol,`${msg||''} ${a} vs ${b} (±${tol})`);

test('toy curves have prime order, closed addition and wrap-around at n',()=>{
  for(const [p,n] of [[13,7],[43,31],[67,79]]){
    const c=curve.curve(p);assert.equal(c.n,n);
    for(const P of c.points)for(const Q of c.points.slice(0,8))assert.ok(curve.onCurve(curve.add(P,Q,p),p));
    assert.equal(curve.mul(n,c.G,p).point,null);
    assert.deepEqual(curve.mul(n+1,c.G,p).point,c.G);
    const m=curve.multiples(c);for(let k=1;k<n;k++)assert.deepEqual(curve.mul(k,c.G,p).point,m[k]);
    assert.equal(new Set(m.slice(1).map(String)).size,n-1);
    assert.equal(curve.bruteForce(c,m[n-2]),n-2);
  }
  const r=curve.realAdd([0,Math.sqrt(7)],[2,Math.sqrt(15)]);close(r.sum[1]**2,r.sum[0]**3+7,1e-9,'real sum on curve');
  const c67=curve.curve(67),op=curve.mul(255,c67.G,67);assert.equal(op.doubles,7);assert.equal(op.adds,7);assert.equal(curve.mul(64,c67.G,67).adds,0);
});

test('coin purse conserves value and drops dust change into the fee',()=>{
  for(const type of Object.keys(coins.TYPES))for(const strategy of ['largest','smallest'])for(const rate of [1,5,30,150])for(const payment of [5000,60000,300000]){
    const r=coins.build({payment,rate,type,strategy});if(!r.ok)continue;
    assert.equal(r.sum,payment+r.change+r.fee);
    assert.ok(r.fee>=Math.ceil(r.size*rate),'fee covers size × rate');
    assert.ok(r.change===0||r.change>=coins.TYPES[type].dust);
    assert.equal(r.size,coins.vsize(r.inputs.length,r.outputs,type));
  }
  assert.equal(coins.vsize(1,2,'segwit'),141);
  assert.ok(coins.effective(1200,100,'segwit')<0);
  assert.equal(coins.build({payment:600000,rate:10,strategy:'manual',manual:[0]}).ok,false);
});

test('mempool projection fills blocks by fee rate and mines CPFP packages together',()=>{
  const r=rng(4),pool0=Array.from({length:400},(_,i)=>mempool.makeTx(r,i+1));
  const proj=mempool.project(pool0,3);
  proj.blocks.forEach(b=>assert.ok(b.size<=mempool.CAP));
  for(let i=1;i<proj.blocks.length;i++)assert.ok(proj.blocks[i-1].minRate>=proj.blocks[i].maxRate-1e-9||proj.blocks[i-1].size>mempool.CAP*0.97);
  const low={id:'me',size:141,fee:141},child={id:'child',parent:'me',size:110,fee:Math.ceil(80*251)-141};
  const first=mempool.project([...pool0,low,child],1).blocks[0].units.flatMap(u=>u.txs.map(t=>t.id));
  assert.ok(first.includes('me')&&first.includes('child'),'high-fee child pulls its parent into the next block');
  const alone=mempool.project([...pool0,low],1).blocks[0].units.flatMap(u=>u.txs.map(t=>t.id));assert.ok(!alone.includes('me'));
  const big=Array.from({length:1200},(_,i)=>mempool.makeTx(r,i+1)),trimmed=mempool.trim(big);
  assert.ok(trimmed.pool.reduce((a,t)=>a+t.size,0)<=mempool.MEMPOOL_LIMIT);assert.ok(trimmed.minFee>0);
});

test('Merkle root matches block 100,000 and every inclusion proof verifies',()=>{
  const txids=['8c14f0db3df150123e6f3dbbf30f8b955a8249b62ac1d1ff16284aefa3d06d87','fff2525b8931402dd09222c50775608f75787bd2b87e56995a7bdd30f79702c4','6359f0868171b1d194cbee1af2f16ea598ae8fad666d9b012c8ed2b79a236ec4','e9a66845e05d5abc0ad04ec80f774a7e585c6e8db975962d069a522137b80c1d'];
  assert.equal(merkle.toTxid(merkle.rootOf(txids.map(merkle.fromTxid))),'f3e94742aca4b5ef85488dc37c06c3282295ffec960994b2c0d5ac2a25a95766');
  for(const n of [1,2,3,5,7,8,13,16]){const lv=merkle.levels(Array.from({length:n},(_,i)=>merkle.leaf('tx'+i)));
    for(let i=0;i<n;i++){const pr=merkle.proof(lv,i);assert.equal(pr.length,merkle.proofSize(n));assert.ok(merkle.verify(lv[0][i].hash,pr,lv.at(-1)[0].hash));
      assert.ok(!merkle.verify(merkle.leaf('forged'),pr,lv.at(-1)[0].hash));}}
  assert.equal(merkle.proofSize(1000000),20);
});

test('retargeting clamps to 4× and restores ten-minute blocks; issuance sums to 20,999,999.9769 BTC',()=>{
  assert.equal(diff.retarget(1,1),4);assert.equal(diff.retarget(1,1e12),0.25);close(diff.retarget(2,2016*20),1,1e-12);
  const sim=diff.simulate({hashrate:d=>d<20?1:0.5,epochs:8,rng:rng(9)});
  assert.ok(sim.epochs[1].days>16,'the shocked period runs long');close(sim.epochs.at(-1).days,14,1.5,'settles near two weeks');
  assert.equal(diff.MAX_SUPPLY,2099999997690000);assert.equal(diff.supplyAt(7e6),diff.MAX_SUPPLY);
  assert.equal(diff.subsidy(0),5e9);assert.equal(diff.subsidy(840000),312500000);assert.equal(diff.subsidy(6930000),0);
  close(diff.yearOf(840000),2024.3,0.05);close(diff.heightOf(diff.yearOf(1234567)),1234567,1);
});

test('pool payouts keep the expected value and cut the variance',()=>{
  const r=rng(2),opts={share:0.001,poolShare:0.3,days:30,fee:0.02,scheme:'prop'};let s=0,p=0,s2=0,p2=0;const N=20000;
  for(let i=0;i<N;i++){const x=pool.trial(r,opts);s+=x.solo;p+=x.pool;s2+=x.solo**2;p2+=x.pool**2;}
  const E=pool.expected(0.001,30);close(s/N,E,E*0.03,'solo mean');close(p/N,E*0.98,E*0.03,'pool mean minus fee');
  close(Math.sqrt(s2/N-(s/N)**2),pool.soloSd(0.001,30),pool.soloSd(0.001,30)*0.05,'solo sd');
  assert.ok(Math.sqrt(p2/N-(p/N)**2)<0.25*pool.soloSd(0.001,30));
  close(pool.pNoBlock(1/144,1),Math.exp(-1),1e-12);
});

test('double-spend probabilities match the whitepaper, Rosenfeld and simulation',()=>{
  close(race.satoshi(0.1,5),0.0009137,1e-7);close(race.satoshi(0.3,5),0.1773523,1e-7);close(race.satoshi(0.1,1),0.2045873,1e-7);
  close(race.exact(0.1,1),0.2,1e-12);assert.equal(race.confirmationsFor(0.1),6);assert.equal(race.exact(0.5,10),1);
  for(const [q,z] of [[0.1,2],[0.3,3],[0.4,6]])close(race.monteCarlo(rng(q*100+z),q,z,30000),race.exact(q,z),0.012,`q=${q} z=${z}`);
});

test('selfish-mining simulation matches Eyal–Sirer; natural forks rise with delay ÷ interval',()=>{
  close(forks.threshold(0),1/3,1e-12);close(forks.threshold(0.5),0.25,1e-12);
  for(const [a,g] of [[0.2,0],[0.3,0.5],[0.4,1]])close(forks.selfishSim({alpha:a,gamma:g,events:300000,rng:rng(a*10)}).share,forks.selfishRevenue(a,g),0.006,`α=${a} γ=${g}`);
  assert.ok(forks.selfishRevenue(0.3,0)<0.3);assert.ok(forks.selfishRevenue(0.3,1)>0.3);
  const slow=forks.forkSim({interval:600,delay:6,blocks:2000,rng:rng(1)}),fast=forks.forkSim({interval:15,delay:6,blocks:2000,rng:rng(1)});
  assert.ok(slow.rate<0.03);assert.ok(fast.rate>0.15);
});

test('multisig enumeration agrees with the binomial formula and with simulation',()=>{
  const k=['hwhome','hwhome','hwhome'],st=multisig.STORAGE.hwhome,l=st.loss,c=st.theft;
  const r=multisig.risk(k,2,{years:1,disaster:0});
  close(r.lockout,3*l*l*(1-l)+l**3,1e-12,'lockout');close(r.theft,3*c*c*(1-c)+c**3,1e-12,'theft');
  const fire=multisig.risk(k,2,{years:1,disaster:0.05}),spread=multisig.risk(['hwhome','office','bank'],2,{years:1,disaster:0.05});
  assert.ok(fire.lockout>0.05,'one fire locks out an all-at-home setup');assert.ok(spread.lockout<fire.lockout/3);
  const keys=['phone','paper','friend'],opt={years:5,disaster:0.02},exact=multisig.risk(keys,2,opt),sim=multisig.simulate(keys,2,opt,rng(8),40000);
  close(sim.filter(x=>x==='stolen').length/40000,exact.theft,0.01,'theft');close(sim.filter(x=>x==='lost').length/40000,exact.lockout-exact.both,0.01,'lockout');
});

test('Lightning routing conserves capacity, charges fees hop by hop and learns from failures',()=>{
  const net=routing.network(rng(21)),know=routing.freshKnowledge(net);
  const before=net.map(c=>c.bal),res=routing.pay(net,know,120000);
  assert.ok(res.ok);assert.ok(res.attempts>=1);
  net.forEach((ch,i)=>{assert.ok(ch.bal>=0&&ch.bal<=ch.cap);const k=know[i];assert.ok(k.lo<=ch.bal&&ch.bal<=k.hi,`knowledge brackets truth on ${ch.a}-${ch.b}`);});
  const last=res.log.at(-1).q;for(let i=0;i<last.route.length-1;i++)assert.equal(last.amts[i]-last.amts[i+1],routing.fee(net[last.route[i+1].ch],last.amts[i+1]));
  const aBefore=before.reduce((s,b,i)=>s+(net[i].a==='A'?b:0),0),aAfter=net.reduce((s,c)=>s+(c.a==='A'?c.bal:0),0);
  assert.equal(aBefore-aAfter,120000+res.fees,'Alice pays amount plus fees');
  const net2=routing.network(rng(21)),k2=routing.freshKnowledge(net2),b2=net2.map(c=>c.bal),fail=routing.pay(net2,k2,200000);
  assert.equal(fail.ok,false);assert.deepEqual(net2.map(c=>c.bal),b2,'an incomplete multi-part payment releases every part');
  const net4=routing.network(rng(1)),b4=net4.map(c=>c.bal),mpp=routing.pay(net4,routing.freshKnowledge(net4),450000,{parts:4});
  assert.equal(mpp.ok,false);assert.ok(mpp.released>0);assert.deepEqual(net4.map(c=>c.bal),b4,'parts that arrived are released when the payment is incomplete');
  const net3=routing.network(rng(21)),ok3=routing.pay(net3,routing.freshKnowledge(net3),200000,{parts:3});assert.ok(ok3.ok,'splitting succeeds where one path fails');
});

/* --- Second set of experiments --- */
const ledger=require('../src/demos/ledger.js');
const byz=require('../src/demos/byzantine.js');
const rsa=require('../src/demos/rsa.js');
const hash=require('../src/demos/hash.js');
const script=require('../src/demos/script.js');
const soft=require('../src/demos/softfork.js');
const flex=require('../src/demos/flexload.js');
const hd=require('../src/demos/hdwallet.js');
const chan=require('../src/demos/channel.js');

test('ledger models: notebooks inflate supply, the bookkeeper rejects or abuses, shared copies diverge only on simultaneous spends',()=>{
  assert.equal(ledger.run('private','double').at(-1).claimed,30);
  assert.equal(ledger.run('private','honest').at(-1).claimed,ledger.TOTAL);
  const central=ledger.run('central','double');assert.equal(central.at(-1).bankTotal,ledger.TOTAL);assert.ok(central.at(-1).msgs.some(m=>m.ok===false));
  assert.equal(ledger.run('central','abuse').at(-1).bankTotal,ledger.TOTAL+10);
  assert.ok(ledger.run('public','double').every(s=>s.agree));
  assert.equal(ledger.run('public','simul').at(-1).agree,false);
  for(const mode of ['central','public'])for(const sc of ['honest','double','simul'])ledger.run(mode,sc).forEach(s=>Object.values(s.copies).forEach(c=>assert.equal(Object.values(c).reduce((a,b)=>a+b,0),ledger.TOTAL)));
});

test('OM(m) reaches agreement exactly when n > 3f and m ≥ f (exhaustive over placements, strategies and orders)',()=>{
  for(const [n,m,f] of [[4,1,1],[5,1,1],[7,2,2],[4,1,0]])assert.equal(byz.exhaustive(n,m,f).fail,0,`n=${n} m=${m} f=${f}`);
  for(const [n,m,f] of [[3,1,1],[4,0,1],[6,2,2],[7,1,2]])assert.ok(byz.exhaustive(n,m,f).fail>0,`n=${n} m=${m} f=${f} should fail somewhere`);
  assert.equal(byz.run({n:7,rounds:2,traitors:[]}).messages,6+6*5+6*5*4);
});

test('modular arithmetic and toy RSA round-trip for every message and prime pair',()=>{
  assert.equal(rsa.inv(5,12),5);assert.equal(rsa.inv(6,12),null);assert.equal(rsa.orbit('mul',2,13).seq.length,12);
  for(const p of [11,31,97])for(const q of [13,61,89]){const k=rsa.keys(p,q,17);assert.equal((k.e*k.d)%k.phi,1);
    for(let m=0;m<k.n;m+=Math.ceil(k.n/150)){assert.equal(rsa.decrypt(rsa.encrypt(m,k),k),m);assert.equal(rsa.modpow(rsa.modpow(m,k.d,k.n),k.e,k.n),m);}}
  assert.deepEqual([rsa.factor(187).p,rsa.factor(187).q],[11,17]);
  close(rsa.gnfsCoreYears(768),2000,1e-6);assert.ok(rsa.gnfsCoreYears(2048)>1e12);
});

test('hash demo: real SHA-256, avalanche near 128 bits, puzzle and birthday searches behave as expected',()=>{
  const {createHash}=require('node:crypto');
  assert.equal(Buffer.from(hash.sha('abc')).toString('hex'),createHash('sha256').update('abc').digest('hex'));
  let total=0;for(let i=0;i<400;i++)total+=hash.diffBits(hash.sha('m'+i),hash.sha('m'+i+'!'));close(total/400,128,3,'mean flipped bits');
  const r=hash.search('test',10);assert.ok(r.found&&hash.leadingZeros(r.hash)>=10);
  assert.equal(hash.leadingZeros(Uint8Array.from([0,0x1f,0xff])),11);
  let tries=0;for(let i=0;i<60;i++)tries+=hash.birthday('b'+i+'-',16).tries;close(tries/60,hash.birthdayExpected(16),hash.birthdayExpected(16)*0.2,'birthday mean');
});

test('script machine: valid spends succeed and each fault fails at the expected instruction',()=>{
  const expect={p2pkh:{ok:true,wrongkey:'OP_EQUALVERIFY',forged:'false'},multi:{ok:true,one:'OP_CHECKMULTISIG',order:'false',nodummy:'OP_CHECKMULTISIG'},hashlock:{ok:true,wrong:'false'},timelock:{ok:true,early:'OP_CHECKLOCKTIMEVERIFY'},htlc:{bob:true,bobwrong:'OP_EQUALVERIFY',refund:true,early:'OP_CHECKLOCKTIMEVERIFY'}};
  for(const [tpl,cases] of Object.entries(expect))for(const [c,want] of Object.entries(cases)){const r=script.run(tpl,c);
    if(want===true)assert.ok(r.ok,`${tpl}/${c}`);else if(want==='false'){assert.ok(!r.ok&&!r.error,`${tpl}/${c} ends false`);}else{assert.ok(!r.ok&&r.error,`${tpl}/${c}`);assert.equal(r.tokens[r.error.at].op,want);}}
  const skipped=script.run('htlc','refund').frames.filter(f=>f.skipped).length;assert.equal(skipped,4);
});

test('forks: majority soft forks keep one chain, minority soft forks and majority hard forks split',()=>{
  const rate=(type,u)=>soft.splitRate({type,u,freq:0.2,runs:120,rng:rng(Math.round(u*100)+(type==='soft'?0:7))});
  assert.ok(rate('soft',0.85)<0.05);assert.ok(rate('soft',0.3)>0.9);assert.ok(rate('hard',0.8)>0.95);assert.equal(rate('hard',0),0);
  const stall=soft.simulate({type:'hard',u:1,freq:0.3,blocks:60,rng:rng(3)});assert.ok(stall.split&&stall.oldTip.height<stall.newTip.height);
});

test('flexible miner runs only below break-even and never earns less than always-on',()=>{
  close(flex.breakEven(45,20),93.75,1e-9);
  for(const [k,pre] of Object.entries(flex.PRESETS)){const d=flex.day({prices:pre.p,mw:10,hashprice:45,eff:20,overhead:10});
    assert.ok(d.F.profit>=d.A.profit-1e-9,k);d.flex.forEach((h,i)=>assert.equal(h.on,pre.p[i]+10<d.B,`${k} hour ${i}`));}
  const dr=flex.day({prices:flex.PRESETS.winter.p,mw:10,hashprice:80,eff:15,peakHours:4,peakPay:100});assert.equal(dr.flex.filter((h,i)=>dr.peaks.has(i)&&h.on).length,0);assert.ok(dr.F.dr>0);
});

test('seed search space and HD access rules',()=>{
  assert.equal(hd.searchBits(12,12),127);assert.equal(hd.searchBits(24,24),255);assert.equal(hd.searchBits(12,1),6);assert.equal(hd.searchBits(12,0),0);assert.equal(hd.searchBits(12,0,60),59);
  const nodes=hd.tree('s'),a=hd.access(nodes,{watch:true,leakXpub:true}),b=hd.access(nodes,{leakXpub:true,leakChild:true}),c=hd.access(nodes,{leakChild:true});
  assert.equal(nodes.length,14);assert.ok(nodes.filter(n=>n.level===5).every(n=>a[n.path].attacker==='public'&&a[n.path].watch==='public'));
  assert.ok(nodes.filter(n=>n.level>=3).every(n=>b[n.path].attacker==='private'));assert.equal(nodes.filter(n=>c[n.path].attacker==='private').length,1);
  assert.notEqual(hd.tree('s')[3].id,hd.tree('s+typo')[3].id);assert.equal(hd.tree('s')[3].id,hd.tree('s')[3].id);
});

test('channel: payments conserve capacity; revoked broadcasts are punished within the timelock',()=>{
  const ch=chan.channel();chan.pay(ch,'A',50000);chan.pay(ch,'A',150000);chan.pay(ch,'B',50000);
  ch.states.forEach(s=>assert.equal(s.a+s.b,chan.CAP));assert.deepEqual([...ch.revoked],[0,1,2]);
  assert.equal(chan.close(ch,{cooperative:true}).onchain,2);
  const pen=chan.close(ch,{k:0,closer:'A',delay:144,offline:100});assert.equal(pen.kind,'penalty');assert.equal(pen.b,chan.CAP);assert.equal(pen.a,0);
  const theft=chan.close(ch,{k:0,closer:'A',delay:144,offline:300});assert.equal(theft.kind,'theft');assert.equal(theft.stolen,150000);
  assert.equal(chan.close(ch,{k:0,closer:'A',delay:144,offline:300,tower:true}).kind,'penalty');
  const honest=chan.close(ch,{k:3,closer:'B',delay:144});assert.equal(honest.kind,'unilateral');assert.equal(honest.block,144);
  assert.equal(chan.pay(ch,'B',2000000),false);
});

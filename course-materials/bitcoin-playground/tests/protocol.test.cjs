'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const P=require('../src/protocol.js');
const hash=bytes=>createHash('sha256').update(bytes).digest();

test('portable SHA-256 matches the platform implementation across padding boundaries',()=>{
  for(const size of [0,1,3,55,56,63,64,65,80,128,200]){
    const input=Uint8Array.from({length:size},(_,i)=>(i*19+7)&255);
    assert.equal(P.hex(P.sha256(input)),hash(input).toString('hex'));
  }
});
test('the mining example hashes an 80-byte header, compares little-endian numeric hashes, and stops at first success',()=>{
  const bytes=P.header(11), view=new DataView(bytes.buffer);
  assert.equal(bytes.length,80);assert.equal(view.getUint32(72,true),0x200fffff);assert.equal(view.getUint32(76,true),11);
  for(const trial of P.trials){
    const native=hash(hash(P.header(trial.nonce))).reverse().toString('hex');
    assert.equal(trial.hash,native);
    assert.equal(trial.valid,BigInt('0x'+native)<=BigInt('0x'+P.TARGET));
  }
  assert(P.trials.at(-1).valid);assert(P.trials.slice(0,-1).every(t=>!t.valid));
});
test('an ordinary spend conserves value and candidate coinbase comes first',()=>{
  assert.equal(P.TX.input,P.TX.payment+P.TX.change+P.TX.fee);
  assert(P.TX.fee>0);assert.equal(P.snapshot(4).candidate[0],'coinbase');
  assert(P.snapshot(4).candidate.includes('A'));
});
test('creation, local relay, mining, receipt and validation alone confer no confirmations',()=>{
  for(let step=0;step<8;step++){
    assert.equal(P.snapshot(step).confirmations,0);
    assert.equal(P.snapshot(step).accepted,false);
  }
  assert.equal(P.snapshot(8).confirmations,1);
});
test('an invalid spend causes a whole mined block to fail independent validation',()=>{
  const invalid=P.snapshot(7,{invalid:true});
  assert(invalid.checks[0].ok);assert(invalid.checks.some(c=>!c.ok));
  assert.equal(invalid.status,'Block rejected');assert.equal(invalid.accepted,false);
  assert(P.snapshot(7).checks.every(c=>c.ok));
});
test('mempools are local, and confirmed transactions leave this example’s pools',()=>{
  const local=P.snapshot(3).mempools;
  assert(local.some(pool=>pool.includes('A')));assert(local.some(pool=>!pool.includes('A')));
  assert(P.snapshot(8).mempools.every(pool=>!pool.includes('A')));
});
test('descendants add confirmations, reorganization removes them and readmits the still-valid example spend',()=>{
  assert.equal(P.snapshot(8,{descendants:3}).confirmations,4);
  const reorg=P.snapshot(8,{descendants:3,reorg:true});
  assert.equal(reorg.confirmations,0);assert.equal(reorg.accepted,false);
  assert(reorg.mempools[0].includes('A'));
});
test('seeking backward reconstructs state without retaining future events or experiment mutations',()=>{
  const initial=Array.from({length:9},(_,i)=>P.snapshot(i));
  P.snapshot(8,{descendants:3,reorg:true});P.snapshot(7,{invalid:true});
  for(let i=8;i>=0;i--)assert.deepEqual(P.snapshot(i),initial[i]);
  const changed=P.snapshot(3);changed.mempools[0].push('Z');
  assert(!P.snapshot(3).mempools[0].includes('Z'));
});

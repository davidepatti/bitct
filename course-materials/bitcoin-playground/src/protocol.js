/* Deterministic teaching model. No network, keys, wallet, or Bitcoin RPC. */
(function (root) {
  'use strict';
  const TX = Object.freeze({id:'TX A', input:100000, payment:60000, change:39000, fee:1000, outpoint:'prior-tx:0'});
  const stages = [
    {name:'The whole picture',short:'Overview',slide:25,color:'purple',layer:'Bitcoin system overview',title:'One transaction. Many independent decisions.',description:'Follow Alice’s payment to Bob through wallets, peers, miners, and full nodes. Each actor has a local view. Shared history emerges from validation and proof-of-work chain selection.',takeaway:'Keep your eye on the purple transaction slip.',detail:'The diagram groups roles for clarity. In practice, one machine can perform several roles, and a wallet can connect to its own full node.'},
    {name:'Create & sign',short:'Wallet',slide:26,color:'purple',layer:'Wallet / application',title:'Alice creates and authorizes a payment.',description:'Her wallet selects a 100,000 satoshi UTXO, creates 60,000 sats for Bob and 39,000 sats of change, and signs the spend. The remaining 1,000 sats are the transaction fee.',takeaway:'The signature authorizes a proposed spend. It does not confirm it.',detail:'Inputs reference exact prior outputs (txid:vout). Outputs specify amounts and locking conditions. This example assumes a signature committing to the full transaction. No real private keys or signatures are generated here.'},
    {name:'Validate & relay',short:'Relay',slide:27,color:'blue',layer:'P2P relay + node policy',title:'A peer checks it, then tells its neighbors.',description:'Alice sends the signed transaction to a peer. Receiving nodes check it against their local state and admission policy before accepting and relaying it. The purple slips are copies of the same transaction.',takeaway:'Relaying a transaction does not establish a shared ordering.',detail:'The introductory exchange is announcement → request → transaction (inv → getdata → tx). This is a schematic, not a packet trace. Modern relay may use witness transaction identifiers. Conflicting spends can arrive in different orders at different peers.'},
    {name:'Local mempools',short:'Mempools',slide:28,color:'green',layer:'Node policy / implementation',title:'Each node has its own waiting room.',description:'Accepted, unconfirmed transactions wait in a node’s local mempool. Some peers already have Alice’s payment; another has not received it yet. Other transactions and their arrival order can differ too.',takeaway:'There is no global mempool. Local acceptance is not confirmation.',detail:'Admission, replacement, expiry, and eviction are local policy. The trays are snapshots, not a consensus ordering. The background slips B, C, and D are unrelated transactions, not conflicting spends.'},
    {name:'Build a candidate',short:'Candidate',slide:29,color:'orange',layer:'Miner selection + consensus structure',title:'A miner assembles a candidate block.',description:'A miner selects transactions from its local view, puts the coinbase first, and commits to the ordered transactions with a Merkle root. The header also links to the previous block.',takeaway:'A candidate is local and replaceable. Inclusion is the miner’s choice.',detail:'A Bitcoin header is 80 bytes: version, previous block hash, Merkle root, time, nBits, and nonce. Selection depends on fees, dependencies, and local policy. A block can have at most 4,000,000 weight units. The coinbase can claim at most the allowed subsidy plus included fees.'},
    {name:'Find proof of work',short:'Mine',slide:30,color:'orange',layer:'Bitcoin consensus',title:'Many hash attempts. One qualifying header.',description:'Miners change their candidate headers and try again. A valid proof of work has a numeric double-SHA256 hash at or below the target. The small example below uses a deliberately easy target.',takeaway:'Work is costly to find and easy to check. Success time is random.',detail:'This toy actually double-hashes a fixed 80-byte example header and varies its nonce. It is not a valid network block: the transactions, Merkle field, and target are illustrative. Bitcoin compares the full 256-bit numeric hash. There is no mining-progress percentage or predictable number of attempts.'},
    {name:'Relay the block',short:'Block relay',slide:31,color:'blue',layer:'P2P block relay',title:'The found block travels to other nodes.',description:'The successful miner announces its block. Peers obtain the data and pass it onward. A receiving node still needs to check the block before treating it as part of its accepted history.',takeaway:'Receiving a block is different from accepting it.',detail:'Compact block relay can reuse transactions a peer already has, requesting missing ones. Faster propagation reduces stale-block risk; it does not change validity rules. The animation compresses network delays.'},
    {name:'Verify independently',short:'Verify',slide:32,color:'green',layer:'Bitcoin consensus',title:'Every full node repeats the checks.',description:'Each full node checks the header and target, the transaction commitments, the spends and their authorization, and the block’s limits and coinbase reward. Proof of work alone is insufficient.',takeaway:'A mined block with invalid transactions is rejected.',detail:'Input existence and authorization are checked in the block’s branch context, including earlier transactions in the block. A valid block may still belong to a side branch. Try the invalid-block example: its proof of work is assumed valid, but an unauthorized spend makes the entire block invalid.'},
    {name:'Extend the chain',short:'History',slide:33,color:'red',layer:'Bitcoin consensus',title:'Follow the valid chain with the most work.',description:'Alice’s transaction receives its first confirmation when its block joins a node’s active chain. Descendant blocks add confirmations. A competing valid branch with more accumulated work can replace that history.',takeaway:'Confirmations reduce reversal risk; they do not create absolute finality.',detail:'Chain selection compares cumulative work among valid chains, not a vote or merely a block count. The branch exercise uses equal work per block for legibility. Its reorganization leaves TX A unspent on the new branch, so this simplified node readmits it to its mempool; real readmission also depends on validity and policy.'}
  ].map(Object.freeze);

  // SHA-256, including padding and big-endian message words (FIPS 180-4).
  const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const rotr=(x,n)=>(x>>>n)|(x<<(32-n));
  function sha256(input){
    const length=input.length, padded=new Uint8Array(Math.ceil((length+9)/64)*64);
    padded.set(input);padded[length]=128;
    const dv=new DataView(padded.buffer);dv.setUint32(padded.length-4,length*8);
    const h=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    for(let off=0;off<padded.length;off+=64){
      const w=new Uint32Array(64);
      for(let i=0;i<16;i++)w[i]=dv.getUint32(off+4*i);
      for(let i=16;i<64;i++){const a=w[i-15],b=w[i-2];w[i]=(w[i-16]+(rotr(a,7)^rotr(a,18)^(a>>>3))+w[i-7]+(rotr(b,17)^rotr(b,19)^(b>>>10)))>>>0;}
      let [a,b,c,d,e,f,g,hh]=h;
      for(let i=0;i<64;i++){const t1=(hh+(rotr(e,6)^rotr(e,11)^rotr(e,25))+((e&f)^(~e&g))+K[i]+w[i])>>>0;const t2=((rotr(a,2)^rotr(a,13)^rotr(a,22))+((a&b)^(a&c)^(b&c)))>>>0;hh=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}
      [a,b,c,d,e,f,g,hh].forEach((v,i)=>{h[i]=(h[i]+v)>>>0;});
    }
    const out=new Uint8Array(32),v=new DataView(out.buffer);h.forEach((n,i)=>v.setUint32(4*i,n));return out;
  }
  const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  const TARGET='0fffff'+'0'.repeat(58); // compact nBits 0x200fffff
  function header(nonce){
    const b=new Uint8Array(80),v=new DataView(b.buffer);
    v.setUint32(0,0x20000000,true);
    for(let i=4;i<68;i++)b[i]=(i*17+11)%256;
    v.setUint32(68,1700000000,true);v.setUint32(72,0x200fffff,true);v.setUint32(76,nonce,true);return b;
  }
  function hashAttempt(nonce){const hash=hex(sha256(sha256(header(nonce))).reverse());return Object.freeze({nonce,hash,valid:hash<=TARGET});}
  const trials=[];
  for(let nonce=0;nonce<4096;nonce++){const trial=hashAttempt(nonce);trials.push(trial);if(trial.valid)break;}
  if(!trials.at(-1).valid)throw new Error('The deterministic example needs a winning hash.');
  function snapshot(step,options={}){
    step=Math.max(0,Math.min(8,Number.isFinite(step)?Math.floor(step):0));
    const invalid=step===7&&Boolean(options.invalid);
    const reorg=step===8&&Boolean(options.reorg);
    const descendants=step===8?Math.max(0,Math.min(3,Number(options.descendants)||0)):0;
    const confirmations=step===8&&!reorg?1+descendants:0;
    const status=step===0?'Not created':step===1?'Signed proposal':step===2?'Relaying':step===3?'Unconfirmed':step===4?'In a candidate':step===5?'Proof of work found':step===6?'Block received':invalid?'Block rejected':step===7?'Block valid':reorg?'Unconfirmed again':'Confirmed';
    return {step,tx:TX,status,confirmations,invalid,reorg,descendants,accepted:step===8&&!reorg,
      mempools:step<2?[[],[],[],[]]:step===2?[['A'],['A'],[],['A']]:step===8&&!reorg?[['B','C'],['C'],['D','B'],['B']]:[['A','B','C'],['B','A'],['C','D'],['C','A','B']],
      candidate:step>=4?['coinbase','A','B']:[],branchWork:{main:2+descendants,rival:3+descendants},
      checks:step>=7?[{label:'Header & proof of work',ok:true},{label:'Transaction commitments',ok:true},{label:'Unspent inputs & authorization',ok:!invalid},{label:'Block limits & reward',ok:true}]:[]};
  }
  const api={TX,stages,sha256,hex,header,hashAttempt,trials,TARGET,snapshot};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.PlaygroundProtocol=api;
})(typeof window!=='undefined'?window:globalThis);

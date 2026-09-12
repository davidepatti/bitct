(function(){
  'use strict';
  const P=window.PlaygroundProtocol,A=window.PlaygroundArt,main=document.querySelector('main');
  // Add future tools here. Each tool owns its route and can reuse the artwork/model conventions.
  const tools=[{id:'transaction',title:'The life of a transaction',description:'Follow a payment through the network, into a block, and onto the chain. Pause, go back, and see who checks what.',render:renderTool}];
  let step=0,playing=false,animating=false,elapsed=0,lastTime=0,speed=1,raf=0;
  let options={invalid:false,reorg:false,descendants:0};
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const duration=7200;
  const $=id=>document.getElementById(id);
  const icon={back:'←',next:'→',play:'▶',pause:'Ⅱ'};
  document.querySelector('.skip-link').onclick=e=>{e.preventDefault();main.focus({preventScroll:true});};
  function stop(){playing=false;animating=false;cancelAnimationFrame(raf);raf=0;document.querySelector('.scene-svg')?.pauseAnimations?.();}
  function hub(){stop();document.title='Bitcoin Playground';document.documentElement.style.setProperty('--accent','#8256d8');
    main.innerHTML=`<section class="hub-intro"><p class="eyebrow">THE BITCOIN COURSE · INTERACTIVE TOOLS</p><h1>Explore how<br>Bitcoin works.</h1><p>Small experiments. Visible mechanisms.<br>A playground for following the protocol, one step at a time.</p></section>
    <div class="collection-label"><p class="eyebrow">YOUR PLAYGROUND</p><span>${String(tools.length).padStart(2,'0')} tool${tools.length===1?'':'s'} available</span></div>
    ${tools.map((tool,i)=>`<article class="tool-card"><div class="tool-card-copy"><div class="toy-number">${String(i+1).padStart(2,'0')} / PROTOCOL OVERVIEW</div><h2>${tool.title}</h2><p>${tool.description}</p><button class="primary" data-launch="${tool.id}">Open the tool &nbsp; →</button></div><div class="tool-card-art" aria-hidden="true">${A.overview()}</div></article>`).join('')}
    <div class="hub-bottom"><p>This is the first tool in Bitcoin Playground. Future experiments will live here, with the same offline launch experience.</p><span>No account. No connection. Just curiosity.</span></div>`;
    main.querySelectorAll('[data-launch]').forEach(b=>b.addEventListener('click',()=>{options={invalid:false,reorg:false,descendants:0};location.hash=b.dataset.launch+'/0';}));
    if(reduced.matches)document.querySelector('.scene-svg')?.pauseAnimations?.();
  }
  function renderTool({continuePlaying=false}={}){
    cancelAnimationFrame(raf);const s=P.stages[step],state=P.snapshot(step,options);
    const color=A.colors[s.color];document.documentElement.style.setProperty('--accent',color);document.documentElement.style.setProperty('--wash',color+'17');
    document.title=`${s.name} · Bitcoin Playground`;
    main.innerHTML=`<div class="tool-heading"><div><p class="eyebrow" style="margin-bottom:8px">TOOL 01 · PROTOCOL OVERVIEW</p><h1>The life of a transaction</h1></div><div class="heading-actions"><button class="quiet" id="fullscreen" aria-pressed="false">⛶ &nbsp; Focus</button><button class="quiet" id="hub">← Playground</button></div></div>
      <nav class="stepper" aria-label="Transaction stages">${P.stages.map((t,i)=>`<button class="step-tab ${i<step?'complete':''}" data-step="${i}" ${i===step?'aria-current="step"':''} aria-label="Step ${i+1}: ${t.name}"><span class="step-index">${String(i+1).padStart(2,'0')}</span>${t.short}</button>`).join('')}</nav>
      <div class="workbench"><div class="canvas-wrap"><div class="canvas-meta"><p class="eyebrow">${s.layer}</p><span class="scene-position">M 1.3 / SLIDE ${s.slide}</span></div><div class="scene" id="scene">${A.render(state)}</div><div class="scene-experiment" id="experiment">${experimentControls()}</div><div class="scene-legend"><span class="legend-item"><i class="legend-swatch"></i> Alice’s transaction</span><span class="legend-item"><i class="legend-swatch blue"></i> Independent node</span><span class="legend-item"><i class="legend-swatch yellow"></i> Candidate / block</span></div></div>
      <aside class="narration" aria-live="polite" aria-atomic="true"><p class="eyebrow">STEP ${String(step+1).padStart(2,'0')} OF 09 · ${s.short.toUpperCase()}</p><h2>${s.title}</h2><p>${s.description}</p><div class="takeaway">${s.takeaway}</div><div class="tx-status"><p class="eyebrow">TRACKING ALICE’S PAYMENT · TX A</p><div class="status-value"><span class="tx-dot"></span><span id="tx-status">${state.status}</span></div><dl><div><dt>Payment</dt><dd>60,000 sats</dd></div><div><dt>Confirmations</dt><dd id="confirmations">${state.confirmations}</dd></div></dl></div></aside></div>
      <div class="transport"><div class="transport-main"><button id="previous" ${step===0?'disabled':''}>${icon.back} &nbsp; Back</button><button id="play" class="primary">${icon.play} &nbsp; Play</button><button id="next" ${step===8?'disabled':''}>Next &nbsp; ${icon.next}</button></div><div class="transport-options"><button class="quiet" id="replay">↻ &nbsp; Replay step</button><label>Speed <select id="speed" aria-label="Playback speed"><option value="0.5">0.5×</option><option value="1">1×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label><span class="keyboard-hint">← → step &nbsp; / &nbsp; Space play</span></div></div>
      <div class="progress-track" aria-hidden="true"><div id="progress" class="progress-fill"></div></div>
      <details class="teaching-detail"><summary>Look closer · mechanism and teaching notes</summary><p>${s.detail}</p></details>
      <footer class="tool-footer"><span>Teaching simulation · time compressed · no live Bitcoin network</span><span>Bitcoin Playground / 1.0</span></footer>`;
    $('speed').value=String(speed);
    $('hub').onclick=()=>{location.hash='hub';};
    $('previous').onclick=()=>go(step-1);
    $('next').onclick=()=>go(step+1);
    $('play').onclick=togglePlay;
    $('replay').onclick=()=>{playing=false;beginAnimation();updatePlay();};
    $('speed').onchange=e=>{speed=Number(e.target.value);};
    $('fullscreen').onclick=()=>{document.body.classList.toggle('fullscreen');$('fullscreen').setAttribute('aria-pressed',String(document.body.classList.contains('fullscreen')));$('fullscreen').textContent=document.body.classList.contains('fullscreen')?'⛶  Exit focus':'⛶  Focus';};
    $('fullscreen').setAttribute('aria-pressed',String(document.body.classList.contains('fullscreen')));
    if(document.body.classList.contains('fullscreen'))$('fullscreen').textContent='⛶  Exit focus';
    main.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>go(Number(b.dataset.step)));
    if($('invalid'))$('invalid').onclick=()=>{options.invalid=!options.invalid;refreshExperiment();};
    if($('add-confirmation'))$('add-confirmation').onclick=()=>{options.descendants=Math.min(3,options.descendants+1);options.reorg=false;refreshExperiment();};
    if($('fork'))$('fork').onclick=()=>{options.reorg=!options.reorg;refreshExperiment();};
    if($('reset-chain'))$('reset-chain').onclick=()=>{options.descendants=0;options.reorg=false;refreshExperiment();};
    playing=continuePlaying;
    beginAnimation();updatePlay();
  }
  function experimentControls(){
    if(step===5)return '<span class="experiment-label">An intentionally easy hash puzzle · use Replay step to watch the trials again</span>';
    if(step===7)return `<span class="experiment-label">What if a mined block breaks a rule?</span><button id="invalid" aria-pressed="${options.invalid}">${options.invalid?'Restore the valid example':'Try an invalid spend'}</button>`;
    if(step===8)return `<button id="add-confirmation" ${options.descendants===3||options.reorg?'disabled':''}>+ Add a confirmation</button><button id="fork" aria-pressed="${options.reorg}">${options.reorg?'Return to original branch':'Show a reorganization'}</button><button class="quiet" id="reset-chain">Reset chain</button>`;
    return '';
  }
  function refreshExperiment(){playing=false;renderTool();document.querySelector('#experiment button:not(:disabled)')?.focus({preventScroll:true});}
  function go(n,autoplay=false){
    const next=Math.max(0,Math.min(8,n));if(next===step&&!autoplay)return;
    playing=autoplay;options={invalid:false,reorg:false,descendants:0};step=next;
    history.replaceState(null,'','#transaction/'+step);
    renderTool({continuePlaying:autoplay});
  }
  function updatePlay(){if($('play')){$('play').innerHTML=playing?`${icon.pause} &nbsp; Pause`:`${icon.play} &nbsp; ${step===8?'Play again':'Play'}`;$('play').setAttribute('aria-label',playing?'Pause walkthrough':step===8?'Play walkthrough again':'Play walkthrough');}}
  function beginAnimation(){
    cancelAnimationFrame(raf);
    document.querySelector('#scene')?.classList.remove('motion-paused');
    elapsed=0;lastTime=0;animating=!reduced.matches;
    const svg=document.querySelector('#scene svg');svg?.pauseAnimations?.();svg?.setCurrentTime?.(reduced.matches?8:0);
    if(step===5)updateMining(reduced.matches?1:0);
    if(!animating&&!playing){$('progress').style.width='100%';return;}
    raf=requestAnimationFrame(tick);
  }
  function tick(now){
    if(!lastTime)lastTime=now;const delta=Math.min(now-lastTime,100);lastTime=now;
    elapsed+=delta*speed;
    const progress=Math.min(1,elapsed/duration);
    if(animating){document.querySelector('#scene svg')?.setCurrentTime?.(progress*7);if(step===5)updateMining(progress);}
    if($('progress'))$('progress').style.width=(progress*100)+'%';
    if(progress>=1){animating=false;if(playing&&step<8){go(step+1,true);return;}playing=false;updatePlay();return;}
    if(animating||playing)raf=requestAnimationFrame(tick);
  }
  function updateMining(progress){
    const trial=P.trials[Math.min(P.trials.length-1,Math.floor(progress*P.trials.length))];
    const nonce=document.querySelector('.hash-nonce'),hash=document.querySelector('.hash-display'),tail=document.querySelector('.hash-tail'),verdict=document.querySelector('.hash-verdict');
    if(!nonce)return;nonce.textContent=trial.nonce;hash.textContent=trial.hash.slice(0,28);tail.textContent=trial.hash.slice(28);verdict.textContent=trial.valid?'✓  Hash ≤ target: proof of work found':'↻  Hash above target. Try another nonce.';
    $('tx-status').textContent=trial.valid?'Proof of work found':'Searching for proof of work';
  }
  function togglePlay(){
    if(playing){playing=false;animating=false;cancelAnimationFrame(raf);document.querySelector('#scene')?.classList.add('motion-paused');updatePlay();return;}
    if(step===8){options={invalid:false,reorg:false,descendants:0};go(0,true);return;}
    playing=true;document.querySelector('#scene')?.classList.remove('motion-paused');
    if(elapsed>=duration){go(step+1,true);return;}
    animating=!reduced.matches;lastTime=0;cancelAnimationFrame(raf);raf=requestAnimationFrame(tick);updatePlay();
  }
  function route(){
    stop();document.body.classList.remove('fullscreen');
    const match=location.hash.match(/^#([a-z-]+)(?:\/(\d+))?$/),tool=match&&tools.find(t=>t.id===match[1]);
    if(!tool){hub();return;}
    step=Math.min(8,Number(match[2])||0);options={invalid:false,reorg:false,descendants:0};tool.render();
  }
  $('help-button').onclick=()=>{$('help-dialog').showModal();if(playing)togglePlay();};
  document.addEventListener('keydown',e=>{
    if($('help-dialog').open||!$('next')||e.metaKey||e.ctrlKey||e.altKey||e.target.closest('input,select,textarea,[contenteditable]'))return;
    // Native buttons retain Space/Enter semantics; shortcuts work elsewhere on the page.
    if(e.code==='Space'&&e.target.closest('button,summary,a'))return;
    const handlers={ArrowRight:()=>go(step+1),ArrowLeft:()=>go(step-1),Home:()=>go(0),End:()=>go(8),KeyR:()=>{playing=false;beginAnimation();updatePlay();},Space:togglePlay};
    const handler=handlers[e.code];if(handler){e.preventDefault();handler();}
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden){if(playing)togglePlay();animating=false;cancelAnimationFrame(raf);}});
  reduced.addEventListener('change',()=>{if($('scene'))renderTool();else hub();});
  window.addEventListener('hashchange',route);
  // Read-only state hook is useful for repeatable classroom/browser QA.
  window.BitcoinPlayground={getState:()=>({tool:$('scene')?'transaction':'hub',...P.snapshot(step,options),playing,speed}),version:'1.0.0'};
  route();
})();

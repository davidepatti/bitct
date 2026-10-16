# Bitcoin Playground

An offline collection of visual teaching tools for the Bitcoin course. **The life of a transaction** animates the protocol overview in canonical M 1.3. Nineteen interactive experiments follow it: each is one scene with a few parameters to change, so students can build intuition by watching the consequence. They complement the Docker laboratories; they do not run Bitcoin software.

## Launch

- **Any desktop platform:** download [bitcoin-playground.html](bitcoin-playground.html), then double-click it. It opens locally in a recent browser. No installation, terminal, server, account, or internet connection is required. On GitHub, use **Download raw file**, rather than saving the GitHub page.
- **macOS 13 or later:** download and extract [bitcoin-playground-macos.zip](bitcoin-playground-macos.zip), then double-click `Bitcoin Playground.app`. It runs from the extracted folder in its own window. The universal binary includes Apple Silicon and Intel code. It is ad-hoc signed, not Apple-notarized, so macOS may ask for explicit permission to open a downloaded copy. The HTML edition avoids that app approval step.

Both editions open the Playground hub, grouped by course module. Choose **Open** on any tool to begin. Keep the HTML file by itself or move the complete Mac app bundle; both contain everything they need.

## Interactive experiments

| Tool | Module | What students change | What becomes visible |
|---|---|---|---|
| 02 · Who keeps the ledger? | M 1.1 | Ledger model (private notebooks, central bookkeeper, shared checked ledger); scenario | Unchecked double spends inflating supply; a bookkeeper that blocks double spends but can censor or mint; shared copies that diverge when two spends arrive at once |
| 03 · The Byzantine generals | M 1.1 | Generals n, relay rounds m, traitors (click), their strategy, the order | Oral-messages algorithm OM(m) with each lieutenant's evidence; agreement exactly when n > 3f and m ≥ f; message counts; exhaustive check |
| 04 · Modular clock and toy RSA | M 1.2 | Clock size and step; primes p, q, exponent e, message m; encrypt or sign | Orbits and inverses mod n; key generation, encryption and signing with real modular arithmetic; trial division and a calibrated factoring-cost curve |
| 05 · Hash avalanche and puzzles | M 2.0 | Input text; required leading zero bits; truncated hash length | Real SHA-256 bit grids (~128 bits flip); a nonce search with geometric try counts; birthday collisions after ≈ 2^(k/2) tries |
| 06 · The elliptic-curve clock | M 2.0 | Points P and Q on y² = x³ + 7; private key d on toy fields p = 13, 43, 67; key size | Chord-and-tangent addition; d·G in order on a clock but scattered in coordinates; a brute-force key search and the forward/backward effort gap at 256 bits |
| 07 · Coin purse and fee builder | M 2.1 | Payment, fee rate, coin-selection strategy, address type; coins picked by hand | Inputs = payment + change + fee; size in vB; uneconomic coins; dust change dropped to the fee; Legacy vs SegWit vs Taproot sizes |
| 08 · The mempool fee market | M 2.1 | Demand, your fee rate, simulation speed; broadcast, RBF, CPFP | A fee-rate queue cut into projected blocks; random block arrivals; next-block fee rate over time; stuck, rescued and evicted transactions |
| 09 · Script stack machine | M 2.1 | Output type (P2PKH, 2-of-3 multisig, hash lock, CLTV timelock, hash-or-timeout IF/ELSE) and what the spender provides | Step-by-step stack evaluation; the exact instruction where a wrong key, wrong secret, missing dummy element or early locktime fails |
| 10 · Merkle tree explorer | M 2.2 (and M 4.3) | Number of leaves, tampering, the leaf to prove, transactions vs sensor records | Real double-SHA-256 tree; the changed path up to the header; odd-level duplication; log₂ n inclusion proofs |
| 11 · Difficulty and halving clock | M 2.2 | Hashrate shock and growth; year | Block times drifting until the next 2,016-block retarget (×4 limit); subsidy halvings and the 20,999,999.9769 BTC total |
| 12 · Solo vs. pool lottery | M 2.2 | Hashrate share, period, bill, pool share, fee, payout scheme | 400 simulated miners: same expected income, very different variance; the chance of not covering costs |
| 13 · The double-spend race | M 2.3 | Attacker share q, confirmations z | An animated private-chain race; exact (Rosenfeld) and whitepaper probabilities; a 1,000-race Monte Carlo check |
| 14 · Natural forks and selfish mining | M 2.3 | Block interval, propagation delay; selfish share α and tie parameter γ | Stale branches in a simulated block tree; Eyal–Sirer revenue curve, profitability threshold and a state-machine simulation |
| 15 · Soft vs. hard fork | M 2.3 | Tighten or loosen the rules; upgraded hashrate; how often the difference shows up | Which chain old and upgraded nodes follow; orphaned blocks; persistent split rates over 200 histories |
| 16 · Mining as a flexible load | M 2.4 | A day of electricity prices (drag the bars), hashprice, efficiency, fees, site size, demand response | Break-even price; hours on and off; profit of a flexible vs always-on miner; load removed from the priciest hours |
| 17 · Multisig risk dial | M 3.1 | Number of keys, threshold m, where each key is kept, horizon, fire risk | Exact lock-out and theft probabilities; 100 simulated futures; all m-of-n policies on a loss-vs-theft chart |
| 18 · Seed phrase and HD key tree | M 3.1 | Phrase length, words an attacker holds, passphrase, attacker speed; xpub and child-key leaks, passphrase typo | Brute-force time vs missing words; a BIP84-style tree with watch-only, xpub-leak and xpub-plus-child-key consequences (toy words and identifiers only) |
| 19 · Channel abacus and breach | M 5.1 | Payments between Alice and Bob; who closes, which state, timelock, victim offline time, watchtower | Off-chain balance beads; revoked states; cooperative, unilateral, penalty and successful-cheat outcomes on a block timeline |
| 20 · Routing with hidden liquidity | M 5.2 (with M 5.1) | Amount, route preference, multi-path parts; reveal balances | Source routing over channels with private balance splits; failures that teach bounds; hop-by-hop fees; atomic multi-path payments |

Each experiment shows **What to notice**, a short takeaway, live numbers and **Try this** prompts. **Look closer** states the model, its assumptions and what is not modelled. Random runs are seeded so a class can repeat the same run; a dice button draws a new one. Experiments have no slide numbers, so they do not need updating when decks are renumbered. Tools are numbered in course order.

## The transaction journey

| Stage | Course slide | What becomes visible |
|---|---:|---|
| Overview | 25 | Wallets, peers, local mempools, miners, and validating nodes |
| Create and sign | 26 | One input, payment, change, fee, and spending authorization |
| Validate and relay | 27 | Copies travel between peers; one peer has not received the transaction yet |
| Local mempools | 28 | Different unconfirmed views without a global waiting room |
| Candidate block | 29 | Miner selection, coinbase first, ordered transactions, and header commitments |
| Proof of work | 30 | Double-SHA256 trials on an illustrative 80-byte header |
| Block relay | 31 | A found block propagates before peers accept it |
| Independent validation | 32 | Consensus checks and a mined block with an invalid spend |
| Chain selection | 33 | Confirmations, most cumulative work, and a reversible reorganization example |

Use **Back** and **Next**, or select any numbered stage. **Play** advances automatically; **Pause** stops the walkthrough; **Replay step** restarts the current animation. The speed menu adjusts playback. **Focus** hides the app header; the Mac app also supports native full screen from its View menu.

Keyboard shortcuts: left/right arrows change stage, Space plays or pauses, R replays the stage, and Home/End jump to the first/last stage. Space retains its normal activation behavior when a button is focused. Help lists the shortcuts. Reduced-motion preferences show completed illustrations while retaining navigation and optional automatic stepping.

The last two stages contain small experiments: reject a block with an unauthorized spend, add up to three descendant confirmations, and switch to a competing valid branch. Leaving an experimental stage restores the normal walkthrough, so backward/forward navigation does not retain an invalid block or a future reorganization.

## Teaching scope

**Demo readiness: Simulation or toy model.** This application explains active Bitcoin mechanisms, but does not implement an interoperable wallet, node, miner, or regtest laboratory. It uses no real keys, signatures, transactions, funds, or network connections. The diagrams redraw the slide vocabulary as original animated SVG artwork; the slides and their raster images are not bundled.

Alice’s example spends 100,000 sats: 60,000 to Bob, 39,000 change, and a 1,000 sat fee. TX A stays purple throughout. B, C, and D are unrelated background transactions. The diagram separates roles for teaching; a real operator may combine wallet, node, and mining roles on one system.

The mining demonstration really computes SHA256d and compares the complete numeric hash against an easy target. Its fixed header contains illustrative previous-hash and Merkle-root bytes and is not a valid network block. Replaying repeats the same deterministic nonce sequence. This keeps classroom explanations reproducible without suggesting that mining has a predictable duration.

Relay and mempool admission are local behavior; a miner’s inclusion choice is not a consensus promise. A valid proof of work does not excuse invalid spends. A valid block need not be on the active chain. Confirmations can be reversed. The fork exercise assumes equal work per block, while the actual selection rule is cumulative work. In its reorganization, Alice’s input remains unspent and the example node readmits her transaction; real readmission also depends on validity and policy.

The experiments use stated simplifications: toy elliptic curves (not secp256k1), textbook RSA with small primes, symbolic keys and signatures in the script machine, toy seed words and identifiers (never usable keys), a toy block of 20,000 vB, typical single-signature input sizes, illustrative price days, hashprice and key-loss/theft rates, a uniform-liquidity Lightning model, and fixed propagation delays. Their models are checked against published or exact results: SHA-256 against Node's implementation, the whitepaper's double-spend table, Rosenfeld's exact probabilities, the n > 3m condition of the oral-messages algorithm, Eyal and Sirer's selfish-mining revenue, the Merkle root of block 100,000, RSA round trips, and the integer issuance schedule.

For more detail, see the Bitcoin developer guides on [block structure and chain selection](https://developer.bitcoin.org/devguide/block_chain.html) and [peer-to-peer networking](https://developer.bitcoin.org/devguide/p2p_network.html). The numbered course slides remain the teaching-sequence authority.

## Maintain and extend

There are no package dependencies or installation steps. Rebuilding needs Python 3; tests need Node.js 18 or later. These are maintainer tools only.

```sh
python3 scripts/build.py
python3 scripts/build.py --check
node --test tests/protocol.test.cjs tests/demos.test.cjs
```

| File | Responsibility |
|---|---|
| [src/protocol.js](src/protocol.js) | Stage content, immutable state snapshots, payment arithmetic, SHA-256 and nonce trials |
| [src/art.js](src/art.js) | Original SVG actors, nodes, slips, blocks, and stage diagrams |
| [src/kit.js](src/kit.js) | Shared experiment toolkit: page shell, sliders and toggles, SVG charts, seeded randomness, animation loops, demo registry |
| `src/demos/` | One file per experiment: a pure model (exported for tests) followed by its renderer |
| [src/app.js](src/app.js) | Tool registry, module-grouped hub, routes, transaction playback, keyboard support, and experiment mounting |
| [src/styles.css](src/styles.css) | Cream paper palette, stage colors, responsive layout, and motion preferences |
| [src/index.html](src/index.html) | Accessible shell and restrictive offline content policy |
| [scripts/build.py](scripts/build.py) | Deterministic, dependency-free bundling into one portable HTML file |
| [desktop/main.swift](desktop/main.swift) | Native macOS window loading the same bundled HTML |
| [scripts/package-macos.py](scripts/package-macos.py) | Universal app compilation, ad-hoc signature verification, and ZIP packaging |
| [tests/protocol.test.cjs](tests/protocol.test.cjs) | Hash verification, value conservation, confirmation boundaries, rejection, and reversible state |
| [tests/demos.test.cjs](tests/demos.test.cjs) | Experiment models against known values, conservation laws, closed-form results and Monte Carlo agreement |

Add a future experiment as `src/demos/<name>.js`: export its pure model for Node tests, then call `PlaygroundKit.register` with a stable lowercase ID, number, module, title, description, color, `preview()` card art and a `mount(main)` function that returns a cleanup function. List the file explicitly in `DEMOS` in `scripts/build.py`, which sets hub order, and add model tests. Do not add nonfunctional placeholders to the hub.

To rebuild the Mac edition with **already installed** Apple command-line developer tools:

```sh
python3 scripts/package-macos.py
```

The script creates a disposable local app in `output/` and updates the distribution ZIP. Do not install development dependencies on behalf of a maintainer without permission. Generated QA captures and local build products in `output/` are excluded from publication.

## Architecture decision

The reusable boundary is the web interface. The portable HTML edition runs locally today; the exact same file can be hosted later when a web version is requested.

| Option | Suitability for this suite |
|---|---|
| Portable HTML | Smallest distribution. Works offline across desktop platforms with an existing browser. Chosen as the universal launch format. |
| Native macOS WebKit shell | Small standalone app using the system browser engine. Chosen for the first Mac window, with the same HTML bundled inside. |
| Electron | Useful if native Windows, Linux, and Mac packages or consistent Chromium behavior become a requirement. It bundles Chromium and Node.js, adding a runtime and its update/packaging work. A later wrapper can load this same interface. |

[Electron’s introduction](https://www.electronjs.org/docs/latest) describes its bundled runtime and shared JavaScript codebase; its [distribution guide](https://www.electronjs.org/docs/latest/tutorial/distribution-overview) explains platform packaging. Apple’s [WKWebView documentation](https://developer.apple.com/documentation/webkit/wkwebview) supports loading local bundled content. The future possibility of web hosting alone does not require Electron today.

The application makes no remote requests. Its content policy blocks connections and external scripts/assets; the native shell permits only its bundled document and local hash navigation. All state is ephemeral and deterministic. The core is deliberately independent of desktop APIs.

## Rights and distribution

Original code, prose, and SVG diagrams follow the course repository’s existing [MIT license](LICENSE), copyright 2026 Davide Patti. The license is also embedded in the portable HTML and Mac bundle. No course screenshots, third-party illustrations, private source links, or external fonts are redistributed.

The course repository is a distribution mirror. Edit the canonical course workspace, rebuild, run the checks, and publish the explicitly selected files through the course publication manifest. Public edits to these generated distribution files may be replaced by a subsequent publication.

# Bitcoin Playground

An offline collection of visual teaching tools for the Bitcoin course. The first tool, **The life of a transaction**, animates the protocol overview in canonical M 1.3, slides 25–33.

## Launch

- **Any desktop platform:** download [bitcoin-playground.html](bitcoin-playground.html), then double-click it. It opens locally in a recent browser. No installation, terminal, server, account, or internet connection is required. On GitHub, use **Download raw file**, rather than saving the GitHub page.
- **macOS 13 or later:** download and extract [bitcoin-playground-macos.zip](bitcoin-playground-macos.zip), then double-click `Bitcoin Playground.app`. It runs from the extracted folder in its own window. The universal binary includes Apple Silicon and Intel code. It is ad-hoc signed, not Apple-notarized, so macOS may ask for explicit permission to open a downloaded copy. The HTML edition avoids that app approval step.

Both editions open the Playground hub. Choose **Open the tool** to begin. Keep the HTML file by itself or move the complete Mac app bundle; both contain everything they need.

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

For more detail, see the Bitcoin developer guides on [block structure and chain selection](https://developer.bitcoin.org/devguide/block_chain.html) and [peer-to-peer networking](https://developer.bitcoin.org/devguide/p2p_network.html). The numbered course slides remain the teaching-sequence authority.

## Maintain and extend

There are no package dependencies or installation steps. Rebuilding needs Python 3; protocol tests need Node.js 18 or later. These are maintainer tools only.

```sh
python3 scripts/build.py
python3 scripts/build.py --check
node --test tests/protocol.test.cjs
```

| File | Responsibility |
|---|---|
| [src/protocol.js](src/protocol.js) | Stage content, immutable state snapshots, payment arithmetic, SHA-256 and nonce trials |
| [src/art.js](src/art.js) | Original SVG actors, nodes, slips, blocks, and stage diagrams |
| [src/app.js](src/app.js) | Tool registry, hub, routes, playback, keyboard support, and experiments |
| [src/styles.css](src/styles.css) | Cream paper palette, stage colors, responsive layout, and motion preferences |
| [src/index.html](src/index.html) | Accessible shell and restrictive offline content policy |
| [scripts/build.py](scripts/build.py) | Deterministic, dependency-free bundling into one portable HTML file |
| [desktop/main.swift](desktop/main.swift) | Native macOS window loading the same bundled HTML |
| [scripts/package-macos.py](scripts/package-macos.py) | Universal app compilation, ad-hoc signature verification, and ZIP packaging |
| [tests/protocol.test.cjs](tests/protocol.test.cjs) | Hash verification, value conservation, confirmation boundaries, rejection, and reversible state |

Add a future tool with a stable ID in the registry in `src/app.js`, its own renderer, its own independent state, and a corresponding hub preview. Keep the same local launch and navigation conventions. Add its source to the bundle explicitly. Do not add nonfunctional placeholders to the hub.

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

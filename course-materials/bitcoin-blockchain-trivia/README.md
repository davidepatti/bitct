# Bitcoin blockchain trivia reconstruction toolkit

This collection contains `52` small tools for recovering unusual historical
content directly from Bitcoin blocks and transactions. It turns public chain
data into reproducible teaching examples without bundling the recovered
documents, images, audio, code, or other payloads.

For a concise description of every example, read the
[short trivia guide](trivia-guide.md).

## Examples

Preview the guide's early Bitcoin milestones and its stories about messages,
images and memorials. These screenshots show the guide's explanations, not
bundled historical payloads.

| Early Bitcoin milestones | Messages, memorials and artifacts |
|---|---|
| <img src="https://raw.githubusercontent.com/davidepatti/bitct/main/.github/images/course-overview/trivia-history.jpg" alt="The trivia guide introducing the genesis block and Hal Finney" width="400"> | <img src="https://raw.githubusercontent.com/davidepatti/bitct/main/.github/images/course-overview/trivia-culture.jpg" alt="The trivia guide describing embedded images, messages and a memorial" width="400"> |

## What the collection covers

- early Bitcoin milestones, including the genesis headline, the first
  person-to-person transfer, the pizza payment, and halving messages;
- memorials, wedding vows, job applications, poems, jokes, protest messages,
  ASCII art, software checksums, and other human traces;
- images, audio, documents, and programs stored through historical script
  techniques, `OP_RETURN`, SegWit witness data, and Taproot envelopes;
- the changing boundary between Bitcoin consensus data and the application
  protocols used to interpret embedded bytes.

Each reconstruction starts from named transaction IDs, block hashes, or block
heights in `scripts/manifest.json`. The shared parser retains the raw chain
bytes, extracts the relevant carrier, and records what it produced.

## Run a reconstruction

From this collection directory:

```sh
cd scripts
./run-trivia.sh genesis-headline
```

Use a second argument to choose an output directory:

```sh
./run-trivia.sh len-sassaman-memorial /tmp/len-memorial
```

The available topic names are the keys in `manifest.json`. The topic-named
shell entry points in `scripts/` provide the same commands as shortcuts.

## Requirements and safety

The toolkit requires a Unix-like shell and Python `3.10` or newer. It reads
from `https://mempool.space/api` by default, or from Bitcoin Core when
`BITCOIN_CLI` is configured. No third-party Python packages are required.

Recovered blockchain content is untrusted. The toolkit writes bytes for
inspection but never executes reconstructed programs, HTML, JavaScript,
BASIC, or archives. Copyrighted payloads are recovered only when a user runs
the corresponding command; they are not included in this repository.

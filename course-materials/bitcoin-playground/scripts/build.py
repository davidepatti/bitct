#!/usr/bin/env python3
"""Build a single portable, offline HTML application using only Python's stdlib."""
from pathlib import Path
import argparse

ROOT = Path(__file__).resolve().parents[1]
# Interactive demos, listed explicitly in hub order. Each registers itself with PlaygroundKit.
DEMOS = ['demos/ledger.js', 'demos/byzantine.js', 'demos/rsa.js', 'demos/hash.js', 'demos/curve.js',
         'demos/coins.js', 'demos/mempool.js', 'demos/script.js', 'demos/merkle.js', 'demos/difficulty.js',
         'demos/pool.js', 'demos/race.js', 'demos/forks.js', 'demos/softfork.js', 'demos/flexload.js',
         'demos/multisig.js', 'demos/hdwallet.js', 'demos/channel.js', 'demos/routing.js']

def build():
    result = (ROOT / 'src/index.html').read_text()
    result = result.replace('<!-- BUILD:LICENSE -->', '<!--\n' + (ROOT / 'LICENSE').read_text() + '-->')
    sources = [('STYLE', ['styles.css']), ('MODEL', ['protocol.js']), ('ART', ['art.js']), ('KIT', ['kit.js']),
               ('DEMOS', DEMOS), ('APP', ['app.js'])]
    for marker, files in sources:
        content = '\n'.join((ROOT / 'src' / source).read_text() for source in files)
        source = ', '.join(files)
        if '</script' in content.lower() or '</style' in content.lower():
            raise ValueError(f'Unsafe inline closing tag in {source}')
        result = result.replace(f'/* BUILD:{marker} */', content)
    if '/* BUILD:' in result:
        raise ValueError('Unresolved build marker')
    return result

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    path = ROOT / 'bitcoin-playground.html'
    content = build()
    if args.check:
        if not path.exists() or path.read_text() != content:
            raise SystemExit('Portable application is stale. Run python3 scripts/build.py.')
        print('Portable application matches its source.')
    else:
        path.write_text(content)
        print(f'Built {path.name} ({len(content.encode()):,} bytes; no external assets).')

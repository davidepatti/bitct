"""Student procedures as executable steps (source of truth for READMEs, decks and CI).

Each step: id, title, cmd (typed in the lab shell), expect (regexes that must appear),
fails=True when the command is expected to fail, host=... for host-side commands.
"""

LABS = {}

# --------------------------------------------------------------------------
LABS["dlab00-setup"] = {"steps": [
    {"id": "S1", "title": "The node runs regtest", "cmd": "bitcoin-cli getblockchaininfo",
     "expect": [r'"chain": "regtest"', r'"blocks": 0']},
    {"id": "S2", "title": "Mine one block", "cmd": "mine 1", "expect": [r"height now 1"]},
    {"id": "S3", "title": "Status line", "cmd": "lab-status", "expect": [r"node-a\s+chain=regtest\s+height=1"]},
    {"id": "S4", "title": "Dashboard answers", "host": "curl -fsS http://127.0.0.1:${DASHBOARD_PORT:-8080}/ | grep -o 'block height' | head -1",
     "expect": [r"block height"]},
]}

# --------------------------------------------------------------------------
LABS["dlab01-auth"] = {"steps": [
    {"id": "A1", "title": "Create a key pair", "cmd": "bip340 keygen | tee /tmp/k.txt\nSK=$(awk '/secret/{print $3}' /tmp/k.txt); PK=$(awk '/public/{print $3}' /tmp/k.txt)",
     "show": "bip340 keygen", "expect": [r"secret key\s+[0-9a-f]{64}", r"public key\s+[0-9a-f]{64}"]},
    {"id": "A2", "title": "Sign an exact text", "cmd": "bip340 sign --secret $SK --text 'D17 reports 1200 W' | tee /tmp/s.txt\nSIG=$(awk '/^signature/{print $2}' /tmp/s.txt)",
     "show": "bip340 sign --secret $SK --text 'D17 reports 1200 W'", "expect": [r"signature\s+[0-9a-f]{128}"]},
    {"id": "A3", "title": "Verify it", "cmd": "bip340 verify --pubkey $PK --text 'D17 reports 1200 W' --sig $SIG", "expect": [r"VALID"]},
    {"id": "A4", "title": "Change one character", "cmd": "bip340 verify --pubkey $PK --text 'D17 reports 1201 W' --sig $SIG",
     "fails": True, "expect": [r"INVALID"]},
    {"id": "A5", "title": "Another key", "cmd": "OTHER=$(bip340 keygen | awk '/public/{print $3}')\nbip340 verify --pubkey $OTHER --text 'D17 reports 1200 W' --sig $SIG",
     "fails": True, "expect": [r"INVALID"]},
    {"id": "A6", "title": "Official test vectors", "cmd": "bip340 vectors | tail -4", "expect": [r"19/19 official BIP340 test vectors"]},
    {"id": "B1", "title": "Core wallet message signing (legacy)", "cmd":
        "bitcoin-cli -named createwallet wallet_name=alice > /dev/null\nLEG=$(bitcoin-cli -rpcwallet=alice getnewaddress '' legacy)\n"
        "MSIG=$(bitcoin-cli -rpcwallet=alice signmessage $LEG 'D17 reports 1200 W')\necho $LEG; echo $MSIG\n"
        "bitcoin-cli verifymessage $LEG $MSIG 'D17 reports 1200 W'\nbitcoin-cli verifymessage $LEG $MSIG 'D17 reports 1201 W'",
     "expect": [r"^true$", r"^false$"]},
    {"id": "C1", "title": "Four address types from one wallet", "cmd":
        "for t in legacy p2sh-segwit bech32 bech32m; do echo \"$t: $(bitcoin-cli -rpcwallet=alice getnewaddress '' $t)\"; done",
     "expect": [r"legacy: [mn]", r"p2sh-segwit: 2", r"bech32: bcrt1q", r"bech32m: bcrt1p"]},
    {"id": "C2", "title": "Decode a Taproot address", "cmd": "addr decode $(bitcoin-cli -rpcwallet=alice getnewaddress '' bech32m)",
     "expect": [r"bech32m \(BIP350\)", r"regtest", r"Taproot"]},
    {"id": "C3", "title": "Decode the supplied addresses", "cmd":
        "for a in $(grep -o '[13bt][a-zA-Z0-9]\\{25,\\}' /usr/share/bitct/dlab01/addresses.txt); do echo \"== $a\"; addr decode $a | grep -E 'encoding|valid|checksum|mixed' || true; done",
     "expect": [r"does NOT match", r"v0 must use bech32", r"mixed case"]},
    {"id": "C4", "title": "A regtest node and a mainnet address", "cmd":
        "bitcoin-cli validateaddress bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4 | jq '{isvalid, error}'\n"
        "bitcoin-cli validateaddress $(bitcoin-cli -rpcwallet=alice getnewaddress '' bech32) | jq '{isvalid, witness_version}'",
     "expect": [r'"isvalid": false', r'"isvalid": true']},
]}

# --------------------------------------------------------------------------
LABS["dlab02-transaction"] = {"steps": [
    # Part A: the two-node network (former LAB-BTC-NETWORK starter)
    {"id": "N1", "title": "Two empty, isolated nodes", "cmd":
        "btc-a getblockcount; btc-b getblockcount; btc-a getconnectioncount", "expect": [r"^0\n0\n0$"]},
    {"id": "N2", "title": "Connect A to B", "cmd":
        "btc-a addnode node-b:18444 add\nsleep 2\nbtc-a getpeerinfo | jq -r '.[].addr'\nbtc-b getconnectioncount",
     "expect": [r"node-b:18444", r"^1$"]},
    {"id": "N3", "title": "Wallets and 101 blocks", "cmd":
        "btc-a createwallet miner >/dev/null; btc-b createwallet receiver >/dev/null\n"
        "MINER=$(btc-a -rpcwallet=miner getnewaddress)\nbtc-a generatetoaddress 101 $MINER > /dev/null\n"
        "btc-b waitforblockheight 101 10000 | jq .height\nbtc-a -rpcwallet=miner getbalance",
     "expect": [r"^101$", r"^50\.00000000$"]},
    {"id": "N4", "title": "Send 1 BTC and watch both mempools", "cmd":
        "RECV=$(btc-b -rpcwallet=receiver getnewaddress)\nTX1=$(btc-a -rpcwallet=miner sendtoaddress $RECV 1)\necho $TX1\n"
        "for i in $(seq 30); do btc-b getrawmempool | grep -q $TX1 && break; sleep 1; done\n"
        "btc-a getrawmempool; btc-b getrawmempool",
     "show": "RECV=$(btc-b -rpcwallet=receiver getnewaddress)\nTX1=$(btc-a -rpcwallet=miner sendtoaddress $RECV 1)\necho $TX1\nbtc-a getrawmempool\nbtc-b getrawmempool      # repeat after a few seconds if empty",
     "expect": [r"\[\n  \"([0-9a-f]{64})\"\n\]\n\[\n  \"\1\"\n\]"]},
    {"id": "N5", "title": "Confirm with one block", "cmd":
        "btc-a generatetoaddress 1 $MINER > /dev/null\nbtc-b waitforblockheight 102 10000 | jq .height\n"
        "btc-b -rpcwallet=receiver getbalance", "expect": [r"^102$", r"^1\.00000000$"]},
    # Part B: PSBT with P2WPKH, then P2TR
    {"id": "P1", "title": "Fund a P2WPKH output for Alice", "cmd":
        "btc-a createwallet alice\n"
        "A_WPKH=$(btc-a -rpcwallet=alice getnewaddress '' bech32)\n"
        "FUND=$(btc-a -rpcwallet=miner sendtoaddress $A_WPKH 0.5)\n"
        "mine 1\n"
        "VOUT=$(btc-a -rpcwallet=alice listunspent | jq '.[0].vout')\n"
        "btc-a -rpcwallet=alice listunspent | jq '.[] | {txid, vout, amount, address}'",
     "expect": [r'"amount": 0\.5']},
    {"id": "P2", "title": "Build an unsigned PSBT", "cmd":
        "DEST=$(btc-b -rpcwallet=receiver getnewaddress)\n"
        "PSBT=$(btc-a -rpcwallet=alice walletcreatefundedpsbt \\\n"
        "  '[{\"txid\":\"'$FUND'\",\"vout\":'$VOUT'}]' '[{\"'$DEST'\":0.2}]' 0 \\\n"
        "  '{\"add_inputs\":false,\"fee_rate\":5}' | jq -r .psbt)\n"
        "btc-a decodepsbt $PSBT | jq '{outputs: [.tx.vout[] | {value, address: .scriptPubKey.address}], fee, signatures: .inputs[0].partial_signatures}'",
     "expect": [r'"fee": 0\.0000', r'"signatures": null']},
    {"id": "P3", "title": "Sign, finalize, test and broadcast", "cmd":
        "SIGNED=$(btc-a -rpcwallet=alice walletprocesspsbt $PSBT | jq -r .psbt)\n"
        "RAW=$(btc-a finalizepsbt $SIGNED | jq -r .hex)\n"
        "btc-a testmempoolaccept '[\"'$RAW'\"]' | jq '.[0] | {allowed, vsize, fees: .fees.base}'\n"
        "TX2=$(btc-a sendrawtransaction $RAW)\n"
        "echo $TX2",
     "expect": [r'"allowed": true', r'"vsize": 141']},
    {"id": "P4", "title": "Witness of a P2WPKH spend", "cmd":
        "btc-a getrawtransaction $TX2 true | jq '{vsize, weight, witness: .vin[0].txinwitness}'",
     "expect": [r"[0-9a-f]{140,146}", r'"[0-9a-f]{66}"']},
    {"id": "P5", "title": "The same with a Taproot (P2TR) output", "cmd":
        "A_TR=$(btc-a -rpcwallet=alice getnewaddress '' bech32m)\n"
        "FUND_TR=$(btc-a -rpcwallet=miner sendtoaddress $A_TR 0.5)\n"
        "mine 1\n"
        "VOUT_TR=$(btc-a -rpcwallet=alice listunspent 1 9999 '[\"'$A_TR'\"]' | jq '.[0].vout')\n"
        "PSBT_TR=$(btc-a -rpcwallet=alice walletcreatefundedpsbt \\\n"
        "  '[{\"txid\":\"'$FUND_TR'\",\"vout\":'$VOUT_TR'}]' '[{\"'$DEST'\":0.2}]' 0 \\\n"
        "  '{\"add_inputs\":false,\"fee_rate\":5}' | jq -r .psbt)\n"
        "SIGNED_TR=$(btc-a -rpcwallet=alice walletprocesspsbt $PSBT_TR | jq -r .psbt)\n"
        "RAW_TR=$(btc-a finalizepsbt $SIGNED_TR | jq -r .hex)\n"
        "TX3=$(btc-a sendrawtransaction $RAW_TR)\n"
        "btc-a getrawtransaction $TX3 true | jq '{vsize, witness: .vin[0].txinwitness}'",
     "expect": [r'"vsize": 1[0-4][0-9]', r'"[0-9a-f]{128}"']},
    {"id": "P6", "title": "Confirm both", "cmd":
        "mine 1\n"
        "btc-b getrawtransaction $TX2 true | jq '{txid, confirmations}'\n"
        "btc-b getrawtransaction $TX3 true | jq '{txid, confirmations}'",
     "expect": [r'"confirmations": 1']},
    # Part C: failures at different layers
    {"id": "F1", "title": "Change a signed transaction", "cmd":
        "A_TR2=$(btc-a -rpcwallet=alice getnewaddress '' bech32m); F2=$(btc-a -rpcwallet=miner sendtoaddress $A_TR2 0.5); mine 1 > /dev/null\n"
        "V2=$(btc-a -rpcwallet=alice listunspent 1 9999 \"[\\\"$A_TR2\\\"]\" | jq '.[0].vout')\n"
        "P=$(btc-a -rpcwallet=alice walletcreatefundedpsbt \"[{\\\"txid\\\":\\\"$F2\\\",\\\"vout\\\":$V2}]\" \"[{\\\"$DEST\\\":0.2}]\" 0 \"{\\\"add_inputs\\\":false,\\\"fee_rate\\\":5}\" | jq -r .psbt)\n"
        "R=$(btc-a finalizepsbt $(btc-a -rpcwallet=alice walletprocesspsbt $P | jq -r .psbt) | jq -r .hex)\n"
        "TAMPERED=$(python3 -c \"import sys;r=sys.argv[1];print(r.replace('002d310100000000','002e310100000000',1))\" $R)\n"
        "btc-a testmempoolaccept \"[\\\"$TAMPERED\\\"]\" | jq -r '.[0][\"reject-reason\"]'",
     "show": "TAMPERED=… (one output amount changed after signing)\nbtc-a testmempoolaccept '[\"'$TAMPERED'\"]'",
     "expect": [r"mandatory-script-verify-flag-failed|Invalid Schnorr signature"]},
    {"id": "F2", "title": "An unsigned PSBT cannot be finalized", "cmd":
        "btc-a finalizepsbt $P | jq '{complete}'", "expect": [r'"complete": false']},
    {"id": "F3", "title": "A fee below the relay policy", "cmd":
        "LOW=$(btc-a -rpcwallet=alice walletcreatefundedpsbt \"[{\\\"txid\\\":\\\"$F2\\\",\\\"vout\\\":$V2}]\" \"[{\\\"$DEST\\\":0.2}]\" 0 \"{\\\"add_inputs\\\":false,\\\"fee_rate\\\":0.01}\" | jq -r .psbt)\n"
        "RL=$(btc-a finalizepsbt $(btc-a -rpcwallet=alice walletprocesspsbt $LOW | jq -r .psbt) | jq -r .hex)\n"
        "btc-a testmempoolaccept \"[\\\"$RL\\\"]\" | jq -r '.[0][\"reject-reason\"]'",
     "expect": [r"min relay fee not met|mempool min fee not met"]},
]}

# --------------------------------------------------------------------------
LABS["dlab03-structures"] = {"steps": [
    {"id": "H1", "title": "One byte in, half the bits out", "cmd": "hashdiff 'D17 1200 W' 'D17 1201 W'",
     "expect": [r"1 input byte\(s\) differ → \d+ of 256 output bits differ"]},
    {"id": "H2", "title": "A block with several transactions", "cmd":
        "bitcoin-cli createwallet miner >/dev/null\nmine 101 >/dev/null\n"
        "for v in 1 2 3; do bitcoin-cli -rpcwallet=miner sendtoaddress $(bitcoin-cli -rpcwallet=miner getnewaddress) $v >/dev/null; done\n"
        "mine 1\nH=$(bitcoin-cli getblockcount)\nbitcoin-cli getblock $(bitcoin-cli getblockhash $H) | jq '{height, nTx, merkleroot, previousblockhash}'",
     "expect": [r'"nTx": 4']},
    {"id": "H3", "title": "Decode the 80-byte header", "cmd": "header block $H", "expect": [r"proof of work: hash ≤ target → yes", r"bytes 36–67 merkle root"]},
    {"id": "H4", "title": "Rebuild the Merkle root", "cmd": "merkle bitcoin $H", "expect": [r"MATCH"]},
    {"id": "H5", "title": "Change one transaction", "cmd": "merkle bitcoin $H --change 2 | tail -3", "fails": True, "expect": [r"DIFFERENT"]},
    {"id": "H6", "title": "Redo the proof of work", "cmd":
        "OLD=$(bitcoin-cli getblockheader $(bitcoin-cli getblockhash $H) false)\n"
        "NEWROOT=$(merkle bitcoin $H --change 2 | awk '/computed root/{print $3}')\n"
        "FORGED=$(bitcoin-util grind $(header replace-root $OLD $NEWROOT))\n"
        "header decode $FORGED | tail -6\necho \"original block hash: $(bitcoin-cli getblockhash $H)\"",
     "expect": [r"proof of work: hash ≤ target → yes", r"original block hash"]},
    {"id": "H7", "title": "The next block still points to the original", "cmd":
        "mine 1 >/dev/null\nbitcoin-cli getblockheader $(bitcoin-cli getblockhash $((H+1))) | jq -r .previousblockhash\n"
        "header decode $FORGED | sed -n '/block hash/{n;p}'",
     "expect": [r"[0-9a-f]{64}"]},
]}

# --------------------------------------------------------------------------
LABS["dlab04-consensus"] = {"steps": [
    {"id": "C1", "title": "One shared history", "cmd":
        "btc-a getpeerinfo | jq -r '.[].addr'\n"
        "btc-a createwallet miner >/dev/null; btc-b createwallet bob >/dev/null\nmine 101 >/dev/null\n"
        "btc-b waitforblockheight 101 20000 | jq -c .\nbtc-a getconnectioncount",
     "expect": [r'"height":101', r"^1$"]},
    {"id": "C2", "title": "A payment T in both mempools", "cmd":
        "BOB=$(btc-b -rpcwallet=bob getnewaddress)\nT=$(btc-a -rpcwallet=miner sendtoaddress $BOB 2)\n"
        "for i in $(seq 30); do btc-b getrawmempool | grep -q $T && break; sleep 1; done\necho $T; btc-b getrawmempool",
     "expect": [r"[0-9a-f]{64}"]},
    {"id": "C3", "title": "Isolate node B", "cmd": "btc-b setnetworkactive false >/dev/null\nsleep 2\nbtc-a getconnectioncount; btc-b getnetworkinfo | jq .networkactive",
     "expect": [r"^0$", r"^false$"]},
    {"id": "C4", "title": "A mines one block with T", "cmd":
        "mine 1\nbtc-a -rpcwallet=miner gettransaction $T | jq '{confirmations}'",
     "expect": [r"height now 102", r'"confirmations": 1']},
    {"id": "C5", "title": "B mines two empty blocks", "cmd":
        "BADDR=$(btc-b -rpcwallet=bob getnewaddress)\nbtc-b generateblock $BADDR '[]' | jq -r .hash\nbtc-b generateblock $BADDR '[]' | jq -r .hash\n"
        "btc-b getblockcount; btc-b getrawmempool | grep -c $T",
     "expect": [r"^103$", r"^1$"]},
    {"id": "C6", "title": "Two valid tips", "cmd":
        "echo A; btc-a getchaintips | jq -c '.[] | {height, status}'\necho B; btc-b getchaintips | jq -c '.[] | {height, status}'\n"
        "for n in a b; do echo \"$n chainwork $(btc-$n getblockheader $(btc-$n getbestblockhash) | jq -r .chainwork | sed 's/^0*//')\"; done",
     "expect": [r'\{"height":102,"status":"active"\}', r'\{"height":103,"status":"active"\}']},
    {"id": "C7", "title": "Reconnect: the most-work chain wins", "cmd":
        "btc-b setnetworkactive true >/dev/null\nbtc-a addnode node-b:18444 onetry\nbtc-a waitforblockheight 103 30000 | jq -c .\n"
        "btc-a getchaintips | jq -c '.[] | {height, status}'",
     "expect": [r'\{"height":103,"status":"active"\}', r'\{"height":102,"status":"valid-fork"\}']},
    {"id": "C8", "title": "T is unconfirmed again", "cmd":
        "btc-a -rpcwallet=miner gettransaction $T | jq '{confirmations}'\nbtc-a getrawmempool | grep -c $T",
     "expect": [r'"confirmations": 0', r"^1$"]},
    {"id": "C9", "title": "Mined again on the winning branch", "cmd":
        "mine 1 >/dev/null\nbtc-a -rpcwallet=miner gettransaction $T | jq '{confirmations, blockheight}'",
     "expect": [r'"confirmations": 1', r'"blockheight": 104']},
    {"id": "C10", "title": "Worksheet: fewer blocks, more work", "cmd": "header work 1d00ffff 1d00ffff 1d00ffff\nheader work 1c7fffff 1c7fffff",
     "expect": [r"total work of these 3 block\(s\): 12,885,098,499", r"total work of these 2 block\(s\): 17,179,871,232"]},
]}

# --------------------------------------------------------------------------
LABS["dlab05-wallet"] = {"steps": [
    {"id": "W1", "title": "The signer is offline", "cmd":
        "btc-b getnetworkinfo | jq '{networkactive, connections}'\nbtc-b getblockcount\nbtc-b createwallet signer | jq -r .name",
     "expect": [r'"networkactive": false', r"^0$", r"^signer$"]},
    {"id": "W2", "title": "Export public descriptors", "cmd":
        "btc-b -rpcwallet=signer listdescriptors | jq -r '.descriptors[] | select(.desc|startswith(\"wpkh(\")) | .desc'",
     "expect": [r"^wpkh\(\[[0-9a-f]{8}/84h/1h/0h\]tpub[1-9A-HJ-NP-Za-km-z]+/0/\*\)#", r"/1/\*\)#"]},
    {"id": "W3", "title": "Import them into a watch-only wallet", "cmd":
        "btc-a -named createwallet wallet_name=watch disable_private_keys=true blank=true | jq -r .name\n"
        "DESCS=$(btc-b -rpcwallet=signer listdescriptors | jq -c '[.descriptors[] | select(.desc|startswith(\"wpkh(\")) | {desc, active: true, internal, timestamp: \"now\", range: [0,999]}]')\n"
        "btc-a -rpcwallet=watch importdescriptors \"$DESCS\" | jq -c '[.[].success]'",
     "show": "btc-a -named createwallet wallet_name=watch disable_private_keys=true blank=true\nDESCS=$(btc-b -rpcwallet=signer listdescriptors | jq -c '[… public wpkh descriptors …]')\nbtc-a -rpcwallet=watch importdescriptors \"$DESCS\"",
     "expect": [r"^\[true,true\]$"]},
    {"id": "W4", "title": "Same addresses on both sides", "cmd":
        "W=$(btc-a -rpcwallet=watch getnewaddress); S=$(btc-b -rpcwallet=signer getnewaddress)\necho \"watch:  $W\"; echo \"signer: $S\"; [ \"$W\" = \"$S\" ] && echo SAME",
     "expect": [r"^SAME$"]},
    {"id": "W5", "title": "Fund the watched address", "cmd":
        "btc-a createwallet miner >/dev/null; mine 101 >/dev/null\nbtc-a -rpcwallet=miner sendtoaddress $W 1 >/dev/null\nmine 1 >/dev/null\n"
        "btc-a -rpcwallet=watch getbalance; btc-b -rpcwallet=signer getbalance",
     "expect": [r"^1\.00000000\n0\.00000000$"]},
    {"id": "W6", "title": "The coordinator cannot sign", "cmd":
        "DEST=$(btc-a -rpcwallet=miner getnewaddress)\n"
        "PSBT=$(btc-a -rpcwallet=watch walletcreatefundedpsbt '[]' \"[{\\\"$DEST\\\":0.3}]\" 0 '{\"fee_rate\":5}' | jq -r .psbt)\n"
        "btc-a -rpcwallet=watch walletprocesspsbt $PSBT | jq '{complete}'",
     "expect": [r'"complete": false']},
    {"id": "W7", "title": "The offline signer signs", "cmd":
        "SIGNED=$(btc-b -rpcwallet=signer walletprocesspsbt $PSBT | jq -r .psbt)\nbtc-a decodepsbt $SIGNED | jq '.inputs[0] | has(\"final_scriptwitness\")'\n"
        "btc-b getblockcount",
     "expect": [r"^true$", r"^0$"]},
    {"id": "W8", "title": "Broadcast from the coordinator", "cmd":
        "TX=$(btc-a sendrawtransaction $(btc-a finalizepsbt $SIGNED | jq -r .hex))\nmine 1 >/dev/null\nbtc-a -rpcwallet=watch getbalance",
     "expect": [r"^0\.6999"]},
    {"id": "W9", "title": "Restore from the complete backup", "cmd":
        "FULL=$(btc-b -rpcwallet=signer listdescriptors true | jq -c '[.descriptors[] | select(.desc|startswith(\"wpkh(\")) | {desc, active: true, internal, timestamp: 0, range: [0,999]}]')\n"
        "btc-a -named createwallet wallet_name=restored blank=true >/dev/null\nbtc-a -rpcwallet=restored importdescriptors \"$FULL\" | jq -c '[.[].success]'\n"
        "btc-a -rpcwallet=restored getbalance; btc-a -rpcwallet=restored listtransactions | jq length",
     "expect": [r"^\[true,true\]$", r"^0\.6999"]},
    {"id": "W10", "title": "Restore from an incomplete backup", "cmd":
        "PART=$(echo \"$FULL\" | jq -c '[.[] | select(.internal == false)]')\n"
        "btc-a -named createwallet wallet_name=partial blank=true >/dev/null\nbtc-a -rpcwallet=partial importdescriptors \"$PART\" | jq -c '[.[].success]'\n"
        "btc-a -rpcwallet=partial getbalance",
     "expect": [r"^\[true\]$", r"^0\.00000000$"]},
]}

# --------------------------------------------------------------------------
LABS["dlab06-attest"] = {"steps": [
    {"id": "D0", "title": "Checkpoint C0", "cmd": "cd /lab/d17 && ls cases\nd17 prepare-c0\nd17 registry",
     "expect": [r"R42\.json", r"last accepted seq = 41", r"key-A\s+3\s+active"]},
    {"id": "D1", "title": "What exactly was signed (R42)", "cmd": "cd /lab/d17 && d17 explain cases/R42.json",
     "expect": [r"seq=42", r"audience=factory-a\.audit", r"valid"]},
    {"id": "T01", "title": "Accept R42 once → C1", "cmd": "cd /lab/d17 && d17 submit cases/R42.json && d17 checkpoint save C1",
     "expect": [r"ACCEPTED — seq 41 -> 42"]},
    {"id": "T02", "title": "Exact retry", "cmd": "cd /lab/d17 && d17 submit cases/R42.json", "expect": [r"NO_NEW_EVENT — exact retry"]},
    {"id": "T04", "title": "Value changed after signing (from C0)", "cmd": "cd /lab/d17 && d17 checkpoint load C0 >/dev/null && d17 submit cases/R42-altered.json",
     "expect": [r"REJECT_SIGNATURE"]},
    {"id": "T05", "title": "Signed for another audience", "cmd": "cd /lab/d17 && d17 checkpoint load C0 >/dev/null && d17 submit cases/R42-wrong-audience.json\nd17 explain cases/R42-wrong-audience.json | tail -2",
     "expect": [r"REJECT_CONTEXT", r"valid"]},
    {"id": "T06", "title": "Sequence 43 after a long delay", "cmd": "cd /lab/d17 && d17 checkpoint load C0 >/dev/null && d17 submit cases/R43-delayed.json",
     "expect": [r"ACCEPTED — seq 41 -> 43 \(gap of 1"]},
    {"id": "T07", "title": "Out of order: 43 then 42", "cmd": "cd /lab/d17 && d17 checkpoint load C0 >/dev/null && d17 submit cases/R43.json && d17 submit cases/R42.json",
     "expect": [r"ACCEPTED", r"NO_NEW_EVENT — seq 42 <= last accepted 43"]},
    {"id": "T08", "title": "Huge counter, bad signature", "cmd": "cd /lab/d17 && d17 checkpoint load C0 >/dev/null && d17 submit cases/R1000000-badsig.json && d17 submit cases/R42.json",
     "expect": [r"REJECT_SIGNATURE", r"ACCEPTED — seq 41 -> 42"]},
    {"id": "T09", "title": "Reboot: sequence 0", "cmd": "cd /lab/d17 && d17 checkpoint load C0 >/dev/null && d17 submit cases/R0-reboot.json",
     "expect": [r"NO_NEW_EVENT"]},
    {"id": "T10", "title": "Self-declared enrollment 4", "cmd": "cd /lab/d17 && d17 checkpoint load C0 >/dev/null && d17 submit cases/R-self-enrolled-4.json",
     "expect": [r"REJECT_AUTHORITY"]},
    {"id": "T11", "title": "Impostor key-X", "cmd": "cd /lab/d17 && d17 checkpoint load C0 >/dev/null && d17 submit cases/R-impostor-keyX.json",
     "expect": [r"REJECT_AUTHORITY"]},
    {"id": "T12", "title": "Authority service offline", "cmd": "cd /lab/d17 && d17 checkpoint load C0 >/dev/null && d17 authority offline && d17 submit cases/R42.json && d17 authority online",
     "expect": [r"INDETERMINATE"]},
    {"id": "T13", "title": "Replay state lost", "cmd": "cd /lab/d17 && d17 checkpoint load C0 >/dev/null && d17 lose-state --enrollment 3 && d17 submit cases/R42.json",
     "expect": [r"INDETERMINATE — replay state missing"]},
    {"id": "T14", "title": "Routine rotation to key-B (from C1)", "cmd":
        "cd /lab/d17 && d17 checkpoint load C1 >/dev/null\nd17 enroll --key key-B --enrollment 4 --pubkey $(jq -r .pubkey keys/key-B.json) | head -1\n"
        "d17 submit cases/RB1.json\nd17 submit cases/R43-after-cutover.json",
     "expect": [r"ACCEPTED — first report of this enrollment: seq 1", r"REJECT_AUTHORITY — binding is retired"]},
    {"id": "T15", "title": "Compromise: revoke key-A, then replace (from C1)", "cmd":
        "cd /lab/d17 && d17 checkpoint load C1 >/dev/null\nd17 revoke --enrollment 3\nd17 submit cases/R43-after-cutover.json\n"
        "d17 enroll --key key-B --enrollment 4 --pubkey $(jq -r .pubkey keys/key-B.json) | head -1\nd17 submit cases/RB1.json",
     "expect": [r"REJECT_AUTHORITY — binding is revoked", r"ACCEPTED — first report of this enrollment: seq 1"]},
    {"id": "T17", "title": "History after revocation", "cmd": "cd /lab/d17 && d17 reports --last 5\nd17 show 1 | head -3",
     "expect": [r"verdict: ACCEPTED"]},
    {"id": "T18", "title": "A perfectly signed false reading", "cmd":
        "cd /lab/d17 && d17 checkpoint load C0 >/dev/null && d17 submit cases/R42-false-reading.json\ncat ground-truth.csv",
     "expect": [r"ACCEPTED", r"42,310,1200"]},
]}

# --------------------------------------------------------------------------
LABS["dlab07-anchor"] = {"steps": [
    {"id": "M1", "title": "Hash every record", "cmd": "cd /lab/records && ls && sha256sum r0*.csv", "expect": [r"r08\.csv"]},
    {"id": "M2", "title": "Build the Merkle batch", "cmd": "cd /lab/records && merkle build r0*.csv\nROOT=$(merkle build r0*.csv | awk '/^root/{print $2}')",
     "expect": [r"^root [0-9a-f]{64}"]},
    {"id": "M3", "title": "Anchor the root (OP_RETURN)", "cmd": "cd /lab/records && merkle anchor $ROOT | tee /tmp/a.txt\nTXID=$(awk '/anchor transaction/{print $3}' /tmp/a.txt)\nbitcoin-cli getrawmempool",
     "expect": [r"anchor transaction [0-9a-f]{64}"]},
    {"id": "M4", "title": "Mine and inspect", "cmd": "mine 1\nbitcoin-cli getrawtransaction $TXID true | jq '.vout[] | select(.scriptPubKey.type==\"nulldata\") | .scriptPubKey.asm'",
     "expect": [r"OP_RETURN 4249544354?01"]},
    {"id": "M5", "title": "Receipt for r03", "cmd": "cd /lab/records && merkle receipt --index 2 --txid $TXID -o /lab/r03.receipt.json r0*.csv && jq '{file, leaf_index, tree_size, path: (.path|length), root: .root[0:16], anchor: .anchor.txid[0:16]}' /lab/r03.receipt.json",
     "expect": [r'"leaf_index": 2']},
    {"id": "M6", "title": "Verify r03", "cmd": "cd /lab/records && merkle verify /lab/r03.receipt.json r03.csv", "expect": [r"VERIFIED"]},
    {"id": "M7", "title": "Change one byte of r03", "cmd": "cd /lab && cp records/r03.csv r03-changed.csv && sed -i 's/,1198$/,1199/' r03-changed.csv && merkle verify r03.receipt.json r03-changed.csv",
     "fails": True, "expect": [r"\[FAIL\] file bytes", r"NOT VERIFIED"]},
    {"id": "M8", "title": "Missing path: unverifiable", "cmd": "cd /lab && jq '.path=[]' r03.receipt.json > r03-nopath.json && merkle verify r03-nopath.json records/r03.csv",
     "fails": True, "expect": [r"\[FAIL\] Merkle path"]},
    {"id": "M9", "title": "Omission: a batch without r05", "cmd":
        "cd /lab/records && ROOT7=$(merkle build r01.csv r02.csv r03.csv r04.csv r06.csv r07.csv r08.csv | awk '/^root/{print $2}')\n"
        "TX7=$(merkle anchor $ROOT7 | awk '/anchor transaction/{print $3}'); mine 1 >/dev/null\n"
        "merkle receipt --index 4 --txid $TX7 -o /lab/r06.receipt.json r01.csv r02.csv r03.csv r04.csv r06.csv r07.csv r08.csv >/dev/null\n"
        "merkle verify /lab/r06.receipt.json r06.csv | tail -1\ncat expected-set.txt | sed -n '1,8p'",
     "expect": [r"VERIFIED", r"r05\.csv"]},
]}

# --------------------------------------------------------------------------
# In class the meter is the Wokwi ESP32 on a public broker; the automated check
# uses the virtual meter (same report format, same signatures) on the local broker.
LABS["dlab11-esp32"] = {"env": {"MQTT_HOST": "broker", "GROUP": "ci-test", "BATCH_SECONDS": "20", "MINER_INTERVAL": "10"},
 "steps": [
    {"id": "E0", "title": "Gateway subscribed, nothing enrolled", "cmd": "d17 registry", "expect": [r"device\s+key"]},
    {"id": "E1", "title": "Create the device key", "cmd": "d17 keygen --out /lab/device-key.json", "expect": [r"public key \(x-only\):\s+[0-9a-f]{64}"]},
    {"id": "E2", "title": "Start the meter (virtual stand-in for Wokwi)", "host": "docker compose --profile sim up -d device-sim && sleep 25 && docker compose logs --no-log-prefix --tail 4 device-sim",
     "expect": [r"published seq=\d+ value=\d+ W"]},
    {"id": "E3", "title": "Not enrolled → rejected", "cmd": "d17 reports --last 3", "expect": [r"REJECT_AUTHORITY"]},
    {"id": "E4", "title": "Operator enrolls the device key", "cmd": "d17 enroll --enrollment 1 --pubkey $(d17-sim --print-pubkey)",
     "expect": [r"operator O authorized \(D17, key-A, enrollment 1\)"], "sleep": 50},
    {"id": "E5", "title": "Accepted readings", "cmd": "d17 reports --last 6", "expect": [r"ACCEPTED"]},
    {"id": "E6", "title": "Batches anchored and confirmed", "cmd": "for i in $(seq 40); do d17 batches | grep -q confirmed && break; sleep 3; done; d17 batches",
     "expect": [r"regtest\s+[0-9a-f]{16}…\s+\d+\s+confirmed"], "timeout": 200},
    {"id": "E7", "title": "Export and audit a receipt", "cmd":
        "RID=$(python3 -c \"import sqlite3,os;print(sqlite3.connect(os.environ['D17_DB']).execute(\\\"select r.id from reports r join batches b on r.batch_id=b.id where b.status='confirmed' order by r.id limit 1\\\").fetchone()[0])\")\n"
        "d17 receipt $RID -o /lab/receipt-$RID.json\nd17 audit /lab/receipt-$RID.json",
     "expect": [r"\[PASS\] Device signature", r"\[PASS\] Merkle path", r"\[PASS\] Anchor transaction", r"\[PASS\] Block inclusion", r"Result: VERIFIED"]},
    {"id": "E8", "title": "A dishonest collector edits its database", "cmd":
        "d17 tamper $RID --value 400\nd17 receipt $RID -o /lab/receipt-$RID-after.json\nd17 audit /lab/receipt-$RID-after.json; echo \"--- the receipt kept by the auditor:\"; d17 audit /lab/receipt-$RID.json | tail -5",
     "expect": [r"\[FAIL\] Device signature", r"\[FAIL\] Merkle path", r"Result: NOT VERIFIED", r"Result: VERIFIED"]},
    {"id": "E9", "title": "Replay and tampering on the wire", "cmd":
        "d17-sim --resend-last replay\nd17-sim --resend-last tamper\nsleep 2; d17 reports --last 4",
     "expect": [r"NO_NEW_EVENT", r"REJECT_SIGNATURE"]},
    {"id": "E10", "title": "Look for gaps", "cmd": "d17 gaps", "expect": [r"D17/e1: \d+ accepted"]},
    {"id": "E11", "title": "Dashboard D17 page", "host": "curl -fsS http://127.0.0.1:${DASHBOARD_PORT:-8080}/iot | grep -o 'Merkle batches and anchors' | head -1",
     "expect": [r"Merkle batches and anchors"]},
]}

# --------------------------------------------------------------------------
LABS["dlab08-channel"] = {"steps": [
    {"id": "L1", "title": "Two Lightning nodes, no channels", "cmd":
        "bitcoin-cli createwallet miner >/dev/null; mine 1 >/dev/null; sleep 3\nfor n in alice bob; do ln-$n getinfo | jq -c '{alias, synced_to_chain, num_active_channels, id: .identity_pubkey[0:16]}'; done",
     "expect": [r'"alias":"alice","synced_to_chain":true,"num_active_channels":0']},
    {"id": "L2", "title": "Give Alice on-chain coins", "cmd": "ln-fund alice 1 | head -1\nln-alice walletbalance | jq '{confirmed_balance}'",
     "expect": [r'"confirmed_balance": "100000000"']},
    {"id": "L3", "title": "Connect the peers", "cmd":
        "BOB=$(ln-bob getinfo | jq -r .identity_pubkey)\nln-alice connect $BOB@bob:9735\nln-alice listpeers | jq -r '.peers[].address'",
     "expect": [r"bob:9735|:9735"]},
    {"id": "L4", "title": "Open a 500,000 sat channel", "cmd":
        "FUNDTX=$(ln-alice openchannel --node_key $BOB --local_amt 500000 | jq -r .funding_txid)\necho $FUNDTX\n"
        "bitcoin-cli getrawmempool\nln-alice pendingchannels | jq '.pending_open_channels | length'",
     "expect": [r"[0-9a-f]{64}", r"^1$"]},
    {"id": "L5", "title": "Confirm the funding transaction", "cmd":
        "mine 3\nfor i in $(seq 60); do [ \"$(ln-alice getinfo | jq .num_active_channels)\" = 1 ] && break; sleep 1; done\n"
        "ln-alice listchannels | jq '.channels[] | {capacity, local_balance, remote_balance, channel_point}'",
     "expect": [r'"capacity": "500000"']},
    {"id": "L6", "title": "The funding output is a 2-of-2", "cmd":
        "bitcoin-cli getrawtransaction $FUNDTX true | jq '.vout[] | {value, type: .scriptPubKey.type}'",
     "expect": [r'"type": "witness_v0_scripthash"|"type": "witness_v1_taproot"']},
    {"id": "L7", "title": "Bob invoices, Alice pays", "cmd":
        "INV=$(ln-bob addinvoice --amt 50000 --memo 'DLAB08 coffee' | jq -r .payment_request)\necho ${INV:0:60}…\n"
        "ln-alice payinvoice --force --json $INV | jq '{status, value_sat, fee_sat}'\necho \"on-chain mempool: $(bitcoin-cli getmempoolinfo | jq .size) transactions\"",
     "expect": [r'"status": "SUCCEEDED"', r"on-chain mempool: 0 transactions"]},
    {"id": "L8", "title": "Balances moved off-chain", "cmd":
        "for n in alice bob; do echo \"$n: $(ln-$n listchannels | jq -c '.channels[0] | {local_balance, remote_balance}')\"; done",
     "expect": [r'bob: \{"local_balance":"50000"']},
    {"id": "L9", "title": "Cooperative close", "cmd":
        "CP=$(ln-alice listchannels | jq -r '.channels[0].channel_point')\n"
        "CLOSETX=$(ln-alice closechannel --funding_txid ${CP%:*} --output_index ${CP#*:} | jq -r .closing_txid)\necho $CLOSETX\nmine 6 >/dev/null\n"
        "for i in $(seq 30); do [ \"$(ln-alice closedchannels | jq '.channels | length')\" = 1 ] && break; sleep 1; done\n"
        "bitcoin-cli getrawtransaction $CLOSETX true | jq '.vout[] | {value, type: .scriptPubKey.type}'\n"
        "ln-alice closedchannels | jq '.channels[-1] | {close_type, settled_balance}'",
     "expect": [r'"close_type": "COOPERATIVE_CLOSE"']},
    {"id": "L10", "title": "A second channel and a payment", "cmd":
        "ln-alice openchannel --node_key $BOB --local_amt 400000 | jq -r .funding_txid\nmine 3 >/dev/null\n"
        "for i in $(seq 60); do [ \"$(ln-bob listchannels --active_only | jq '.channels | length')\" = 1 ] && [ \"$(ln-alice listchannels --active_only | jq '.channels | length')\" = 1 ] && break; sleep 1; done; sleep 2\n"
        "INV2=$(ln-bob addinvoice --amt 20000 | jq -r .payment_request)\n"
        "for i in 1 2 3 4 5; do S=$(ln-alice payinvoice --force --json $INV2 2>/dev/null | jq -r .status); [ \"$S\" = SUCCEEDED ] && break; sleep 3; done; echo $S",
     "expect": [r"SUCCEEDED"]},
    {"id": "L11", "title": "Alice closes alone (force close)", "cmd":
        "CP2=$(ln-alice listchannels | jq -r '.channels[0].channel_point')\n"
        "ln-alice closechannel --force --funding_txid ${CP2%:*} --output_index ${CP2#*:} > /dev/null\nsleep 2\n"
        "FORCETX=$(ln-alice pendingchannels | jq -r '.waiting_close_channels[0].closing_txid')\necho $FORCETX\n"
        "bitcoin-cli getrawtransaction $FORCETX true | jq '[.vout[] | {value, type: .scriptPubKey.type}]'\nmine 6 >/dev/null; sleep 4\n"
        "ln-alice pendingchannels | jq '.pending_force_closing_channels[] | {limbo_balance, maturity_height, blocks_til_maturity}'",
     "expect": [r"[0-9a-f]{64}", r'"blocks_til_maturity": \d+']},
    {"id": "L12", "title": "Bob is paid at once; Alice waits", "cmd":
        "ln-bob walletbalance | jq '{confirmed_balance, unconfirmed_balance}'\n"
        "N=$(ln-alice pendingchannels | jq '.pending_force_closing_channels[0].blocks_til_maturity')\necho \"Alice must wait $N blocks\"\n"
        "mine $N >/dev/null\nfor i in $(seq 40); do mine 1 >/dev/null; sleep 2; [ \"$(ln-alice pendingchannels | jq '.pending_force_closing_channels | length')\" = 0 ] && break; done\n"
        "ln-alice closedchannels | jq -r '.channels[] | .close_type'",
     "expect": [r"Alice must wait \d+ blocks", r"LOCAL_FORCE_CLOSE"], "timeout": 400},
]}

# --------------------------------------------------------------------------
LABS["dlab09-routing"] = {"steps": [
    {"id": "R0", "title": "Build the frozen topology", "cmd": "ln-topology", "expect": [r"topology ready"], "timeout": 600},
    {"id": "R1", "title": "What the sender can see", "cmd": "lnview graph", "expect": [r"bob→dave", r"carol→dave\s+\d+\s+2000"]},
    {"id": "R2", "title": "Predict the route", "cmd":
        "DAVE=$(ln-dave getinfo | jq -r .identity_pubkey)\n"
        "ln-alice queryroutes --dest $DAVE --amt 300000 | jq '.routes[0] | {total_fees_msat, hops: [.hops[].pub_key[0:8]]}'\nlnview names",
     "expect": [r'"total_fees_msat"']},
    {"id": "R3", "title": "Pay 300,000 sat to Dave", "cmd":
        "INV=$(ln-dave addinvoice --amt 300000 --memo 'DLAB09' | jq -r .payment_request)\nln-alice payinvoice --force --json $INV > /lab/pay1.json\nlnview payment /lab/pay1.json",
     "expect": [r"SUCCEEDED", r"attempt 1: alice → bob → dave\s+FAILED\s+TEMPORARY_CHANNEL_FAILURE", r"alice → carol → dave\s+SUCCEEDED"], "timeout": 180},
    {"id": "R4", "title": "The hidden state (evaluator only)", "cmd": "lnview balances", "expect": [r"bob–dave"]},
    {"id": "R5", "title": "What Alice learned", "cmd": "ln-alice querymc | jq -c '.pairs[] | {from: .node_from[0:8], to: .node_to[0:8], fail_amt: .history.fail_amt_sat, success_amt: .history.success_amt_sat}'",
     "expect": [r'"fail_amt"']},
    {"id": "R6", "title": "Change one condition: Dave refills Bob's side", "cmd":
        "BINV=$(ln-bob addinvoice --amt 400000 | jq -r .payment_request)\nln-dave payinvoice --force --json $BINV | jq -r .status\nln-alice resetmc\nlnview balances",
     "expect": [r"SUCCEEDED"], "timeout": 180},
    {"id": "R7", "title": "Retry the same payment", "cmd":
        "INV2=$(ln-dave addinvoice --amt 300000 | jq -r .payment_request)\nln-alice payinvoice --force --json $INV2 > /lab/pay2.json\nlnview payment /lab/pay2.json",
     "expect": [r"SUCCEEDED", r"attempt 1: alice → bob → dave\s+SUCCEEDED"], "timeout": 180},
]}

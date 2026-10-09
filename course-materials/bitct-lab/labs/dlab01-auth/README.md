# DLAB 01 — Signatures and Address Encodings

| | |
|---|---|
| Stable ID | `LAB-BTC-AUTH` |
| Session | 1 |
| Time | 180 min |
| Lecture | M 2.0 / M 2.1 |
| Network | **regtest** |

## What this experience means

- A signature binds one key to one exact message: change a byte or the key and verification fails.
- An address is an encoding of a locking condition (hash or key) plus a network prefix and a checksum.
- Neither a valid signature nor a valid address proves identity, ownership by a person, or truth.

## Why this network

Signing and decoding are offline operations; the regtest node only provides wallet RPCs. No public network is needed.

## Goal

Sign exact data, verify it, cause controlled failures, and decode current Bitcoin address encodings.

## Start

Open a terminal (PowerShell on Windows) in the `bitct-lab` folder (in the course ZIP: `bitct-main/course-materials/bitct-lab`), then:

```sh
cd labs/dlab01-auth
docker compose up -d --wait
docker compose exec lab bash
```

All commands below are typed **inside the lab shell** (prompt `lab:/lab$`). Shell variables such as `$TX` keep their value until you `exit`.

## Steps

### A1 · Create a key pair

A BIP340 key pair: 32-byte secret, 32-byte x-only public key.

```sh
bip340 keygen | tee /tmp/k.txt
SK=$(awk '/secret/{print $3}' /tmp/k.txt); PK=$(awk '/public/{print $3}' /tmp/k.txt)
```

**Checkpoint:** secret key and public key in hex

### A2 · Sign an exact text

Sign the tagged hash of the exact text.

```sh
bip340 sign --secret $SK --text 'D17 reports 1200 W' | tee /tmp/s.txt
SIG=$(awk '/^signature/{print $2}' /tmp/s.txt)
```

**Checkpoint:** a 64-byte signature: R.x and s

### A3 · Verify it

Anyone with the public key can check it.

```sh
bip340 verify --pubkey $PK --text 'D17 reports 1200 W' --sig $SIG
```

**Checkpoint:** VALID

### A4 · Change one character

One character changes the message hash.

```sh
bip340 verify --pubkey $PK --text 'D17 reports 1201 W' --sig $SIG
```

**Checkpoint:** INVALID

### A5 · Another key

A different key cannot verify it.

```sh
OTHER=$(bip340 keygen | awk '/public/{print $3}')
bip340 verify --pubkey $OTHER --text 'D17 reports 1200 W' --sig $SIG
```

**Checkpoint:** INVALID

### A6 · Official test vectors

Our teaching implementation reproduces the official BIP340 vectors.

```sh
bip340 vectors | tail -4
```

**Checkpoint:** 19/19

### B1 · Core wallet message signing (legacy)

Bitcoin Core's legacy message signing: ECDSA tied to a P2PKH address.

```sh
bitcoin-cli createwallet alice
LEG=$(bitcoin-cli -rpcwallet=alice getnewaddress '' legacy)
MSIG=$(bitcoin-cli -rpcwallet=alice signmessage $LEG 'D17 reports 1200 W')
echo $LEG; echo $MSIG
bitcoin-cli verifymessage $LEG $MSIG 'D17 reports 1200 W'
bitcoin-cli verifymessage $LEG $MSIG 'D17 reports 1201 W'
```

**Checkpoint:** true, then false

### C1 · Four address types from one wallet

One wallet, four address families.

```sh
for t in legacy p2sh-segwit bech32 bech32m; do echo "$t: $(bitcoin-cli -rpcwallet=alice getnewaddress '' $t)"; done
```

**Checkpoint:** m/n…, 2…, bcrt1q…, bcrt1p…

### C2 · Decode a Taproot address

Decode a Taproot address field by field.

```sh
addr decode $(bitcoin-cli -rpcwallet=alice getnewaddress '' bech32m)
```

**Checkpoint:** bech32m, regtest, witness v1, 32-byte key

### C3 · Decode the supplied addresses

Real and broken examples: which checks fail?

```sh
cat /usr/share/bitct/dlab01/addresses.txt
# decode all ten, keeping the lines that matter:
for a in $(grep -o '[13bt][a-zA-Z0-9]\{25,\}' /usr/share/bitct/dlab01/addresses.txt); do echo "== $a"; addr decode $a 2>&1 | grep -E 'encoding|valid|checksum|mixed'; echo; done
```

**Checkpoint:** G: checksum; H, I: wrong variant; J: mixed case

### C4 · A regtest node and a mainnet address

A regtest node rejects a mainnet address.

```sh
bitcoin-cli validateaddress bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4 | jq '{isvalid, error}'
bitcoin-cli validateaddress $(bitcoin-cli -rpcwallet=alice getnewaddress '' bech32) | jq '{isvalid, witness_version}'
```

**Checkpoint:** isvalid false, then true

## Submit

Verification matrix (valid / changed text / other key), decoded-address table A–J, and a 3-line claim-boundary note.

## What this does not show

- a valid signature proves control of a key, not who controls it
- a valid address proves correct encoding, not that anyone will ever spend from it

## Finish

```sh
exit                                  # leave the lab shell
docker compose down                   # stop, keep your state
docker compose down --volumes         # reset: next start is a clean lab
```

One lab at a time: the labs share port 8080. If `docker compose up` reports `port is already allocated`, run `docker compose down` in the other lab's folder first.

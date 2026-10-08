"""Application Merkle tree used by the course receipts (RFC 9162 conventions).

    leaf hash  = SHA256(0x00 || leaf_bytes)
    node hash  = SHA256(0x01 || left || right)
    tree(n)    = split at the largest power of two k < n (no duplicated leaves)

These are deliberately NOT Bitcoin's block Merkle rules (double SHA256 with a
duplicated last node). A receipt is only checkable if its convention is stated.
"""
from __future__ import annotations

import hashlib
from typing import List, Sequence, Tuple

LEAF = b"\x00"
NODE = b"\x01"


def sha256(b: bytes) -> bytes:
    return hashlib.sha256(b).digest()


def leaf_hash(data: bytes) -> bytes:
    return sha256(LEAF + data)


def node_hash(left: bytes, right: bytes) -> bytes:
    return sha256(NODE + left + right)


def _split(n: int) -> int:
    k = 1
    while k * 2 < n:
        k *= 2
    return k


def root_from_hashes(hashes: Sequence[bytes]) -> bytes:
    n = len(hashes)
    if n == 0:
        return sha256(b"")
    if n == 1:
        return hashes[0]
    k = _split(n)
    return node_hash(root_from_hashes(hashes[:k]), root_from_hashes(hashes[k:]))


def root(leaves: Sequence[bytes]) -> bytes:
    """Merkle root of raw leaf byte strings."""
    return root_from_hashes([leaf_hash(x) for x in leaves])


def proof(hashes: Sequence[bytes], index: int) -> List[Tuple[str, bytes]]:
    """Audit path for leaf `index` as a list of (side, sibling_hash), leaf to root.

    side is "L" when the sibling is on the left, "R" when it is on the right.
    """
    n = len(hashes)
    if not 0 <= index < n:
        raise IndexError("leaf index out of range")
    if n == 1:
        return []
    k = _split(n)
    if index < k:
        return proof(hashes[:k], index) + [("R", root_from_hashes(hashes[k:]))]
    return proof(hashes[k:], index - k) + [("L", root_from_hashes(hashes[:k]))]


def root_from_proof(leaf_h: bytes, path: Sequence[Tuple[str, bytes]]) -> bytes:
    h = leaf_h
    for side, sib in path:
        h = node_hash(sib, h) if side == "L" else node_hash(h, sib)
    return h


def verify(leaf_data: bytes, path: Sequence[Tuple[str, bytes]], expected_root: bytes) -> bool:
    return root_from_proof(leaf_hash(leaf_data), path) == expected_root


def path_to_json(path):
    return [{"side": s, "hash": h.hex()} for s, h in path]


def path_from_json(items):
    return [(i["side"], bytes.fromhex(i["hash"])) for i in items]


def levels(hashes: Sequence[bytes]):
    """Return a nested description of the tree, for printing small examples."""
    n = len(hashes)
    if n == 1:
        return {"hash": hashes[0].hex()}
    k = _split(n)
    left, right = levels(hashes[:k]), levels(hashes[k:])
    return {"hash": node_hash(bytes.fromhex(left["hash"]), bytes.fromhex(right["hash"])).hex(),
            "left": left, "right": right}


# --- Bitcoin's block Merkle tree, for comparison in LAB-BTC-STRUCTURES ---

def dsha256(b: bytes) -> bytes:
    return sha256(sha256(b))


def bitcoin_merkle_root(txids_hex_display: Sequence[str]) -> str:
    """Compute a block's Merkle root from txids as shown by bitcoin-cli (big-endian hex)."""
    layer = [bytes.fromhex(t)[::-1] for t in txids_hex_display]
    if not layer:
        raise ValueError("a block has at least one transaction")
    while len(layer) > 1:
        if len(layer) % 2:
            layer.append(layer[-1])
        layer = [dsha256(layer[i] + layer[i + 1]) for i in range(0, len(layer), 2)]
    return layer[0][::-1].hex()

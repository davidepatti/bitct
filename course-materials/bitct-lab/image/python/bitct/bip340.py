"""BIP340 Schnorr signatures over secp256k1 — a small, readable implementation.

Written for teaching: it follows the BIP340 specification step by step and is
checked against the official BIP340 test vectors (see tests/test_bip340.py).
It is NOT constant-time and must never protect real funds.
"""
from __future__ import annotations

import hashlib
import os
from typing import Optional, Tuple

# secp256k1 domain parameters
P = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F
N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
G = (
    0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798,
    0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8,
)

Point = Optional[Tuple[int, int]]


def tagged_hash(tag: str, msg: bytes) -> bytes:
    """SHA256(SHA256(tag) || SHA256(tag) || msg) — BIP340 domain separation."""
    t = hashlib.sha256(tag.encode()).digest()
    return hashlib.sha256(t + t + msg).digest()


def _add(p1: Point, p2: Point) -> Point:
    if p1 is None:
        return p2
    if p2 is None:
        return p1
    if p1[0] == p2[0] and p1[1] != p2[1]:
        return None
    if p1 == p2:
        lam = (3 * p1[0] * p1[0] * pow(2 * p1[1], P - 2, P)) % P
    else:
        lam = ((p2[1] - p1[1]) * pow(p2[0] - p1[0], P - 2, P)) % P
    x3 = (lam * lam - p1[0] - p2[0]) % P
    return (x3, (lam * (p1[0] - x3) - p1[1]) % P)


def point_mul(p: Point, k: int) -> Point:
    r = None
    for i in range(256):
        if (k >> i) & 1:
            r = _add(r, p)
        p = _add(p, p)
    return r


def _bytes_from_int(x: int) -> bytes:
    return x.to_bytes(32, "big")


def _int_from_bytes(b: bytes) -> int:
    return int.from_bytes(b, "big")


def _has_even_y(p: Point) -> bool:
    assert p is not None
    return p[1] % 2 == 0


def lift_x(x: int) -> Point:
    if x >= P:
        return None
    y_sq = (pow(x, 3, P) + 7) % P
    y = pow(y_sq, (P + 1) // 4, P)
    if pow(y, 2, P) != y_sq:
        return None
    return (x, y if y % 2 == 0 else P - y)


def pubkey_gen(seckey: bytes) -> bytes:
    """Return the 32-byte x-only public key for a 32-byte secret key."""
    d0 = _int_from_bytes(seckey)
    if not (1 <= d0 <= N - 1):
        raise ValueError("secret key must be an integer in 1..n-1")
    return _bytes_from_int(point_mul(G, d0)[0])


def sign(seckey: bytes, msg: bytes, aux_rand: Optional[bytes] = None) -> bytes:
    """BIP340 signature (64 bytes) of msg (the course always signs a 32-byte tagged hash)."""
    if aux_rand is None:
        aux_rand = os.urandom(32)
    d0 = _int_from_bytes(seckey)
    if not (1 <= d0 <= N - 1):
        raise ValueError("secret key must be an integer in 1..n-1")
    pt = point_mul(G, d0)
    d = d0 if _has_even_y(pt) else N - d0
    t = bytes(a ^ b for a, b in zip(_bytes_from_int(d), tagged_hash("BIP0340/aux", aux_rand)))
    k0 = _int_from_bytes(tagged_hash("BIP0340/nonce", t + _bytes_from_int(pt[0]) + msg)) % N
    if k0 == 0:
        raise RuntimeError("nonce is zero; try again")
    r = point_mul(G, k0)
    k = k0 if _has_even_y(r) else N - k0
    e = _int_from_bytes(tagged_hash("BIP0340/challenge", _bytes_from_int(r[0]) + _bytes_from_int(pt[0]) + msg)) % N
    sig = _bytes_from_int(r[0]) + _bytes_from_int((k + e * d) % N)
    if not verify(_bytes_from_int(pt[0]), msg, sig):
        raise RuntimeError("produced signature does not verify")
    return sig


def verify(pubkey: bytes, msg: bytes, sig: bytes) -> bool:
    """Return True when sig is a valid BIP340 signature of msg under pubkey."""
    if len(pubkey) != 32 or len(sig) != 64:
        return False
    pt = lift_x(_int_from_bytes(pubkey))
    r = _int_from_bytes(sig[0:32])
    s = _int_from_bytes(sig[32:64])
    if pt is None or r >= P or s >= N:
        return False
    e = _int_from_bytes(tagged_hash("BIP0340/challenge", sig[0:32] + pubkey + msg)) % N
    rr = _add(point_mul(G, s), point_mul(pt, N - e))
    if rr is None or not _has_even_y(rr) or rr[0] != r:
        return False
    return True

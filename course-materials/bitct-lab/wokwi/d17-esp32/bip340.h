// BIP340 Schnorr signatures on secp256k1 using the mbedTLS bignum/ECP API
// shipped with the ESP32 Arduino core (mbedTLS 3.x). Teaching code: it is
// checked against the official BIP340 test vectors, but it is not hardened
// against side channels and must never protect real funds.
#pragma once
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

// RNG used by mbedTLS point blinding. The sketch passes esp_fill_random.
typedef void (*bip340_rng_fn)(void *buf, size_t len);
void bip340_set_rng(bip340_rng_fn fn);

// SHA256(SHA256(tag) || SHA256(tag) || msg)
void bip340_tagged_hash(const char *tag, const uint8_t *msg, size_t len, uint8_t out[32]);

// x-only public key of a 32-byte secret key. Returns 0 on success.
int bip340_pubkey(const uint8_t seckey[32], uint8_t pubkey[32]);

// 64-byte signature of a 32-byte message with 32 bytes of auxiliary randomness.
// Returns 0 on success.
int bip340_sign(const uint8_t seckey[32], const uint8_t msg[32], const uint8_t aux[32], uint8_t sig[64]);

void bip340_hex(const uint8_t *in, size_t len, char *out);  // out needs 2*len+1 bytes
int bip340_unhex(const char *hex, uint8_t *out, size_t len);  // returns 0 on success

#ifdef __cplusplus
}
#endif

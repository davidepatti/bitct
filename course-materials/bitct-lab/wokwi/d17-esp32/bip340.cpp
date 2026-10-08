// BIP340 signing with mbedTLS — see bip340.h
#include "bip340.h"

#include <string.h>

#include "mbedtls/bignum.h"
#include "mbedtls/ecp.h"
#include "mbedtls/sha256.h"

static bip340_rng_fn g_rng = 0;

void bip340_set_rng(bip340_rng_fn fn) { g_rng = fn; }

static int rng_cb(void *ctx, unsigned char *buf, size_t len) {
  (void)ctx;
  if (g_rng) {
    g_rng(buf, len);
  } else {
    for (size_t i = 0; i < len; i++) buf[i] = (unsigned char)(i * 131 + 7);  // host tests only
  }
  return 0;
}

void bip340_tagged_hash(const char *tag, const uint8_t *msg, size_t len, uint8_t out[32]) {
  uint8_t th[32];
  mbedtls_sha256((const unsigned char *)tag, strlen(tag), th, 0);
  mbedtls_sha256_context c;
  mbedtls_sha256_init(&c);
  mbedtls_sha256_starts(&c, 0);
  mbedtls_sha256_update(&c, th, 32);
  mbedtls_sha256_update(&c, th, 32);
  mbedtls_sha256_update(&c, msg, len);
  mbedtls_sha256_finish(&c, out);
  mbedtls_sha256_free(&c);
}

// k*G -> affine x (32 bytes) and y parity (1 = odd)
static int mul_g(mbedtls_ecp_group *grp, const mbedtls_mpi *k, uint8_t x[32], int *odd) {
  mbedtls_ecp_point R;
  mbedtls_ecp_point_init(&R);
  uint8_t buf[65];
  size_t olen = 0;
  int ret = mbedtls_ecp_mul(grp, &R, k, &grp->G, rng_cb, 0);
  if (ret == 0) ret = mbedtls_ecp_point_write_binary(grp, &R, MBEDTLS_ECP_PF_UNCOMPRESSED, &olen, buf, sizeof buf);
  if (ret == 0 && olen == 65) {
    memcpy(x, buf + 1, 32);
    *odd = buf[64] & 1;
  } else if (ret == 0) {
    ret = -1;
  }
  mbedtls_ecp_point_free(&R);
  return ret;
}

int bip340_pubkey(const uint8_t seckey[32], uint8_t pubkey[32]) {
  mbedtls_ecp_group grp;
  mbedtls_mpi d;
  int odd = 0, ret;
  mbedtls_ecp_group_init(&grp);
  mbedtls_mpi_init(&d);
  ret = mbedtls_ecp_group_load(&grp, MBEDTLS_ECP_DP_SECP256K1);
  if (ret == 0) ret = mbedtls_mpi_read_binary(&d, seckey, 32);
  if (ret == 0 && (mbedtls_mpi_cmp_int(&d, 0) <= 0 || mbedtls_mpi_cmp_mpi(&d, &grp.N) >= 0)) ret = -2;
  if (ret == 0) ret = mul_g(&grp, &d, pubkey, &odd);
  mbedtls_mpi_free(&d);
  mbedtls_ecp_group_free(&grp);
  return ret;
}

int bip340_sign(const uint8_t seckey[32], const uint8_t msg[32], const uint8_t aux[32], uint8_t sig[64]) {
  mbedtls_ecp_group grp;
  mbedtls_mpi d, k, e, s;
  uint8_t px[32], rx[32], db[32], t[32], buf[96], h[32];
  int odd = 0, ret;
  mbedtls_ecp_group_init(&grp);
  mbedtls_mpi_init(&d); mbedtls_mpi_init(&k); mbedtls_mpi_init(&e); mbedtls_mpi_init(&s);

  ret = mbedtls_ecp_group_load(&grp, MBEDTLS_ECP_DP_SECP256K1);
  // 1. d0 in [1, n-1]; P = d0*G; d = d0 if P.y even else n - d0
  if (ret == 0) ret = mbedtls_mpi_read_binary(&d, seckey, 32);
  if (ret == 0 && (mbedtls_mpi_cmp_int(&d, 0) <= 0 || mbedtls_mpi_cmp_mpi(&d, &grp.N) >= 0)) ret = -2;
  if (ret == 0) ret = mul_g(&grp, &d, px, &odd);
  if (ret == 0 && odd) {  // d = n - d0 (use a temporary: X and B must not alias)
    ret = mbedtls_mpi_sub_mpi(&s, &grp.N, &d);
    if (ret == 0) ret = mbedtls_mpi_copy(&d, &s);
  }
  // 2. t = bytes(d) XOR hash_aux(a)
  if (ret == 0) ret = mbedtls_mpi_write_binary(&d, db, 32);
  if (ret == 0) {
    bip340_tagged_hash("BIP0340/aux", aux, 32, h);
    for (int i = 0; i < 32; i++) t[i] = db[i] ^ h[i];
    // 3. k0 = int(hash_nonce(t || P.x || m)) mod n
    memcpy(buf, t, 32); memcpy(buf + 32, px, 32); memcpy(buf + 64, msg, 32);
    bip340_tagged_hash("BIP0340/nonce", buf, 96, h);
    ret = mbedtls_mpi_read_binary(&k, h, 32);
  }
  if (ret == 0) ret = mbedtls_mpi_mod_mpi(&k, &k, &grp.N);
  if (ret == 0 && mbedtls_mpi_cmp_int(&k, 0) == 0) ret = -3;
  // 4. R = k0*G; k = k0 if R.y even else n - k0
  if (ret == 0) ret = mul_g(&grp, &k, rx, &odd);
  if (ret == 0 && odd) {  // k = n - k0
    ret = mbedtls_mpi_sub_mpi(&s, &grp.N, &k);
    if (ret == 0) ret = mbedtls_mpi_copy(&k, &s);
  }
  // 5. e = int(hash_challenge(R.x || P.x || m)) mod n
  if (ret == 0) {
    memcpy(buf, rx, 32); memcpy(buf + 32, px, 32); memcpy(buf + 64, msg, 32);
    bip340_tagged_hash("BIP0340/challenge", buf, 96, h);
    ret = mbedtls_mpi_read_binary(&e, h, 32);
  }
  if (ret == 0) ret = mbedtls_mpi_mod_mpi(&e, &e, &grp.N);
  // 6. s = (k + e*d) mod n; sig = R.x || s
  if (ret == 0) ret = mbedtls_mpi_mul_mpi(&s, &e, &d);
  if (ret == 0) ret = mbedtls_mpi_add_mpi(&s, &s, &k);
  if (ret == 0) ret = mbedtls_mpi_mod_mpi(&s, &s, &grp.N);
  if (ret == 0) {
    memcpy(sig, rx, 32);
    ret = mbedtls_mpi_write_binary(&s, sig + 32, 32);
  }
  memset(db, 0, sizeof db); memset(t, 0, sizeof t);
  mbedtls_mpi_free(&d); mbedtls_mpi_free(&k); mbedtls_mpi_free(&e); mbedtls_mpi_free(&s);
  mbedtls_ecp_group_free(&grp);
  return ret;
}

void bip340_hex(const uint8_t *in, size_t len, char *out) {
  static const char *digits = "0123456789abcdef";
  for (size_t i = 0; i < len; i++) {
    out[2 * i] = digits[in[i] >> 4];
    out[2 * i + 1] = digits[in[i] & 15];
  }
  out[2 * len] = 0;
}

static int nib(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}

int bip340_unhex(const char *hex, uint8_t *out, size_t len) {
  if (strlen(hex) != 2 * len) return -1;
  for (size_t i = 0; i < len; i++) {
    int hi = nib(hex[2 * i]), lo = nib(hex[2 * i + 1]);
    if (hi < 0 || lo < 0) return -1;
    out[i] = (uint8_t)(hi << 4 | lo);
  }
  return 0;
}

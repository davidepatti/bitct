# syntax=docker/dockerfile:1
# BITCT course lab image: Bitcoin Core + LND + course tools, one image for every Docker lab.
# Build (teacher/CI):  docker buildx build --platform linux/amd64,linux/arm64 -t ghcr.io/davidepatti/bitct-lab:2026.10 image/
ARG DEBIAN_IMAGE=debian:trixie-slim

# ---------------------------------------------------------------------------
# 1. Download released binaries and check them against pinned SHA-256 hashes.
#    Bitcoin Core hashes: identical in 15 independent guix.sigs attestations for 31.1.
#    LND hashes: from the signed release manifest-v0.21.4-beta.txt.
# ---------------------------------------------------------------------------
FROM ${DEBIAN_IMAGE} AS download
ARG TARGETARCH
ARG BITCOIN_VERSION=31.1
ARG BITCOIN_SHA256_AMD64=b80d9c3e04da78fb6f0569685673418cf686fadba9042d926d13fb87ff503f9e
ARG BITCOIN_SHA256_ARM64=dcf1873f2208ba4f962f3398d47e154c39c0084be8f4553e05c940d0ace3d004
ARG LND_VERSION=v0.21.4-beta
ARG LND_SHA256_AMD64=beffe4949a5e46410d90c0e6d020a1b685468440b0004fc4d59740a6291178fb
ARG LND_SHA256_ARM64=bc5fc872bf12002e1a1ea42b16a13e2f836c2e2439817f336a323bddf680b708
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /dl
RUN set -eux; \
    case "${TARGETARCH}" in \
      amd64) BA=x86_64-linux-gnu;  BS="${BITCOIN_SHA256_AMD64}"; LA=amd64; LS="${LND_SHA256_AMD64}" ;; \
      arm64) BA=aarch64-linux-gnu; BS="${BITCOIN_SHA256_ARM64}"; LA=arm64; LS="${LND_SHA256_ARM64}" ;; \
      *) echo "unsupported architecture ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    curl -fsSLo bitcoin.tgz "https://bitcoincore.org/bin/bitcoin-core-${BITCOIN_VERSION}/bitcoin-${BITCOIN_VERSION}-${BA}.tar.gz"; \
    echo "${BS}  bitcoin.tgz" | sha256sum -c -; \
    tar xzf bitcoin.tgz; mkdir -p /out/bin /out/licenses; \
    curl -fsSLo /out/licenses/bitcoin-core-COPYING "https://raw.githubusercontent.com/bitcoin/bitcoin/v${BITCOIN_VERSION}/COPYING"; \
    for b in bitcoind bitcoin-cli bitcoin-tx bitcoin-util bitcoin-wallet; do \
      cp "bitcoin-${BITCOIN_VERSION}/bin/$b" /out/bin/; done; \
    curl -fsSLo lnd.tgz "https://github.com/lightningnetwork/lnd/releases/download/${LND_VERSION}/lnd-linux-${LA}-${LND_VERSION}.tar.gz"; \
    echo "${LS}  lnd.tgz" | sha256sum -c -; \
    tar xzf lnd.tgz; cp "lnd-linux-${LA}-${LND_VERSION}/lnd" "lnd-linux-${LA}-${LND_VERSION}/lncli" /out/bin/; \
    curl -fsSLo /out/licenses/lnd-LICENSE "https://raw.githubusercontent.com/lightningnetwork/lnd/${LND_VERSION}/LICENSE"

# ---------------------------------------------------------------------------
# 2. Course Python tools (BIP340, Merkle receipts, D17 collector, dashboard).
# ---------------------------------------------------------------------------
FROM ${DEBIAN_IMAGE} AS python
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv \
    && rm -rf /var/lib/apt/lists/*
COPY python/requirements.txt /src/requirements.txt
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/venv/bin/pip install --no-cache-dir -r /src/requirements.txt
COPY python/ /src/bitct/
RUN /opt/venv/bin/pip install --no-cache-dir --no-deps /src/bitct

# ---------------------------------------------------------------------------
# 3. Runtime image (default target for every lab except DLAB 10)
# ---------------------------------------------------------------------------
FROM ${DEBIAN_IMAGE} AS runtime
ARG BITCOIN_VERSION=31.1
ARG LND_VERSION=v0.21.4-beta
ARG BITCT_EDITION=2026.10
LABEL org.opencontainers.image.title="bitct-lab" \
      org.opencontainers.image.description="Course lab image: Bitcoin Core ${BITCOIN_VERSION}, LND ${LND_VERSION}, BITCT course tools" \
      org.opencontainers.image.source="https://github.com/davidepatti/bitct" \
      org.opencontainers.image.version="${BITCT_EDITION}"
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 ca-certificates curl jq less nano vim-tiny procps iproute2 iputils-ping \
      mosquitto mosquitto-clients sqlite3 xxd bash-completion tini \
    && rm -rf /var/lib/apt/lists/*
COPY --from=download /out/bin/ /usr/local/bin/
COPY --from=download /out/licenses/ /usr/share/doc/bitct-lab/
COPY --from=python /opt/venv /opt/venv
COPY rootfs/ /
RUN useradd -m -u 1000 -s /bin/bash lab \
    && mkdir -p /data/d17 /lab /ln/alice /ln/bob /ln/carol /ln/dave \
    && chown -R lab:lab /data /lab /ln \
    && chmod 0755 /usr/local/bin/* \
    && mkdir -p /home/lab/.bitcoin && cp /etc/bitct/bitcoin-cli.conf /home/lab/.bitcoin/bitcoin.conf \
    && cat /etc/bitct/bashrc >> /home/lab/.bashrc \
    && chown -R lab:lab /home/lab \
    && echo "${BITCT_EDITION} (Bitcoin Core ${BITCOIN_VERSION}, LND ${LND_VERSION})" > /etc/bitct/version
ENV PATH=/opt/venv/bin:/usr/local/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin \
    BITCOIN_CHAIN=regtest \
    PYTHONUNBUFFERED=1
USER lab
WORKDIR /lab
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/bitct-entrypoint"]
CMD ["shell"]

# ---------------------------------------------------------------------------
# 4. Graph-learning variant for DLAB 10: JupyterLab + NumPy/pandas/matplotlib.
#    Build with --target ml and tag …:2026.10-ml (about 250 MB more).
# ---------------------------------------------------------------------------
FROM runtime AS ml
USER root
COPY python/requirements-ml.txt /tmp/requirements-ml.txt
RUN /opt/venv/bin/pip install --no-cache-dir -r /tmp/requirements-ml.txt && rm /tmp/requirements-ml.txt
USER lab
EXPOSE 8888
CMD ["jupyter", "lab", "--ip=0.0.0.0", "--port=8888", "--no-browser", "--ServerApp.token=", "--ServerApp.password=", "--ServerApp.root_dir=/lab"]

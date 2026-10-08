"""Block producer for labs that need blocks to keep arriving (e.g. D17 anchoring)."""
import os
import time

from .rpc import BitcoinRPC, ensure_wallet


def main():
    node = os.environ.get("MINER_NODE", "node-a")
    interval = float(os.environ.get("MINER_INTERVAL", "30"))
    rpc = BitcoinRPC(host=node)
    w = ensure_wallet(rpc, "miner")
    addr = w.getnewaddress("block-reward")
    if rpc.getblockcount() < 101:
        rpc.generatetoaddress(101, addr)
    print(f"miner: one block every {interval:.0f}s on {node}", flush=True)
    while True:
        time.sleep(interval)
        h = rpc.generatetoaddress(1, addr)[0]
        print(f"{time.strftime('%H:%M:%S')} mined block {rpc.getblockcount()} {h[:16]}…", flush=True)


if __name__ == "__main__":
    main()

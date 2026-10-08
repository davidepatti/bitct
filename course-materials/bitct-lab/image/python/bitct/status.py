"""lab-status: one line per node of the running lab."""
import json
import os
import subprocess

from .rpc import BitcoinRPC


def main():
    for n in [x for x in os.environ.get("DASH_NODES", "node-a").split(",") if x]:
        try:
            r = BitcoinRPC(host=n, timeout=5)
            bc = r.getblockchaininfo()
            print(f"{n:<8} chain={bc['chain']:<8} height={bc['blocks']:<5} tip={bc['bestblockhash'][:16]}…  "
                  f"peers={r.getconnectioncount()}  mempool={r.getmempoolinfo()['size']}")
        except Exception as exc:  # noqa: BLE001
            print(f"{n:<8} not reachable ({exc})")
    for n in [x for x in os.environ.get("DASH_LN", "").split(",") if x]:
        try:
            out = subprocess.run([f"ln-{n}", "getinfo"], capture_output=True, text=True, timeout=10)
            i = json.loads(out.stdout)
            print(f"⚡{n:<7} synced={i['synced_to_chain']}  channels={i['num_active_channels']}  "
                  f"pending={i['num_pending_channels']}  height={i['block_height']}")
        except Exception as exc:  # noqa: BLE001
            print(f"⚡{n:<7} not ready ({exc})")


if __name__ == "__main__":
    main()

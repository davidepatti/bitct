"""DLAB 10 — graph learning with hidden liquidity (synthetic, CPU-only, NumPy).

A small simulator produces a temporal Lightning-like channel graph with hidden
balances. Three tables are kept apart on purpose:

  observations  what a sender could legitimately know at observation time
  evaluator     the hidden truth (balances) — never a model input
  labels        y = 1 if the source side can send `amount` (reserve-adjusted)

Models compared on the same chronological test periods:
  majority · capacity heuristic · edge-only logistic regression ·
  2-hop message-passing model (SGC-style neighbour averaging + logistic head)

Teaching code: transparent and small, not a research benchmark.
"""
from __future__ import annotations

import json
import math
import os
from dataclasses import dataclass, field

import numpy as np

RESERVE = 0.01  # channel reserve fraction


@dataclass
class Config:
    seed: int = 7
    n_hubs: int = 8
    n_sinks: int = 24
    n_sources: int = 90
    periods: int = 12
    obs_per_period: int = 700
    payments_per_period: int = 900
    train_periods: tuple = (0, 1, 2, 3, 4, 5, 6, 7)
    val_periods: tuple = (8, 9)
    test_periods: tuple = (10, 11)
    notes: list = field(default_factory=lambda: [
        "roles: hubs route, sources mostly pay, sinks mostly receive",
        "balances drift with simulated payments; topology and fees are public",
        "the observer learns only from its own past attempts (previous period)"])


# ------------------------------------------------------------------ simulator
def simulate(cfg: Config):
    rng = np.random.default_rng(cfg.seed)
    nH, nS, nW = cfg.n_hubs, cfg.n_sinks, cfg.n_sources
    n = nH + nS + nW
    role = np.array(["hub"] * nH + ["sink"] * nS + ["source"] * nW)
    edges = set()
    for i in range(nH):                       # hub core
        for j in range(i + 1, nH):
            if rng.random() < 0.7:
                edges.add((i, j))
    for s in range(nH, nH + nS):              # sinks: 2–5 hub channels
        for h in rng.choice(nH, size=rng.integers(2, 6), replace=False):
            edges.add((int(h), s))
    for w in range(nH + nS, n):               # sources: 1–2 hub channels
        for h in rng.choice(nH, size=rng.integers(1, 3), replace=False):
            edges.add((int(h), w))
    edges = sorted(edges)
    m = len(edges)
    cap = np.exp(rng.normal(np.log(2e6), 0.8, size=m)).clip(1e5, 2e7).round()
    for k, (a, b) in enumerate(edges):        # hubs get bigger channels
        if role[a] == "hub" and role[b] == "hub":
            cap[k] *= 3
    # directed views: d = 2k (a->b), d = 2k+1 (b->a)
    src = np.array([e[i] for e in edges for i in (0, 1)])
    dst = np.array([e[1 - i] for e in edges for i in (0, 1)])
    chan = np.repeat(np.arange(m), 2)
    local = np.zeros(2 * m)
    frac = rng.beta(2, 2, size=m)
    local[0::2] = frac * cap
    local[1::2] = (1 - frac) * cap
    base = np.where(role[src] == "hub", rng.choice([0, 1000], size=2 * m), 1000).astype(float)
    ppm = np.where(role[src] == "hub", np.exp(rng.normal(np.log(150), 0.7, size=2 * m)),
                   np.exp(rng.normal(np.log(40), 0.5, size=2 * m))).round()
    # adjacency for shortest paths (by fee, ignoring balances: the sender cannot see them)
    adj = [[] for _ in range(n)]
    for d in range(2 * m):
        adj[src[d]].append(d)

    def path(u, v, amt):
        import heapq
        dist = {u: 0.0}
        prev = {}
        pq = [(0.0, u)]
        while pq:
            c, x = heapq.heappop(pq)
            if x == v:
                break
            if c > dist.get(x, math.inf):
                continue
            for d in adj[x]:
                if cap[chan[d]] < amt:
                    continue
                y = dst[d]
                nc = c + base[d] / 1000 + ppm[d] * amt / 1e6 + 1.0
                if nc < dist.get(y, math.inf):
                    dist[y], prev[y] = nc, d
                    heapq.heappush(pq, (nc, y))
        if v not in prev:
            return None
        out, x = [], v
        while x != u:
            out.append(prev[x])
            x = src[prev[x]]
        return out[::-1]

    rev = np.arange(2 * m) ^ 1
    sources = np.where(role == "source")[0]
    sinks = np.where(role == "sink")[0]
    obs_rows, eval_rows = [], []
    feedback = {}  # (directed channel) -> list of outcomes seen by the observer last period
    for t in range(cfg.periods):
        # 1. payments move liquidity (mostly sources -> sinks)
        for _ in range(cfg.payments_per_period):
            if rng.random() < 0.8:
                u, v = rng.choice(sources), rng.choice(sinks)
            else:
                u, v = rng.choice(n, size=2, replace=False)
            amt = float(np.exp(rng.normal(np.log(6e4), 1.0)))
            p = path(int(u), int(v), amt)
            if not p:
                continue
            if all(local[d] - RESERVE * cap[chan[d]] >= amt for d in p):
                for d in p:
                    local[d] -= amt
                    local[rev[d]] += amt
        # occasional rebalancing / new deposits keep the system alive
        for k in rng.choice(m, size=max(1, m // 20), replace=False):
            f = rng.beta(2, 2)
            local[2 * k], local[2 * k + 1] = f * cap[k], (1 - f) * cap[k]
        # 2. observations: (directed channel, amount) probes made by one observer
        new_feedback = {}
        ds = rng.integers(0, 2 * m, size=cfg.obs_per_period)
        for d in ds:
            c = cap[chan[d]]
            amt = float(np.exp(rng.uniform(np.log(1e4), np.log(0.9 * c))))
            spendable = local[d] - RESERVE * c
            y = int(spendable >= amt)
            fb = feedback.get(int(d))
            obs_rows.append({
                "period": t, "dir": int(d), "channel": int(chan[d]), "src": int(src[d]), "dst": int(dst[d]),
                "amount": round(amt), "capacity": c, "fee_base_msat": base[d], "fee_ppm": ppm[d],
                "deg_src": len(adj[src[d]]), "deg_dst": len(adj[dst[d]]),
                "prev_attempts": 0 if fb is None else len(fb),
                "prev_success_rate": np.nan if fb is None else float(np.mean(fb)),
            })
            eval_rows.append({"period": t, "dir": int(d), "local_balance": local[d], "spendable": spendable, "label": y})
            new_feedback.setdefault(int(d), []).append(y)
        feedback = new_feedback
    topo = {"n": n, "role": role.tolist(), "src": src.tolist(), "dst": dst.tolist(), "channel": chan.tolist(),
            "capacity": cap.tolist()}
    return obs_rows, eval_rows, topo


# ------------------------------------------------------------------ features
OBS_FEATURES = ["log_capacity", "log_amount", "amount_over_capacity", "log_fee_ppm", "fee_base_msat",
                "log_deg_src", "log_deg_dst", "prev_success_rate_filled", "has_prev"]


def table(rows):
    keys = list(rows[0].keys())
    return {k: np.array([r[k] for r in rows], dtype=float) for k in keys}


def edge_features(o):
    X = np.column_stack([
        np.log(o["capacity"]), np.log(o["amount"]), o["amount"] / o["capacity"], np.log1p(o["fee_ppm"]),
        o["fee_base_msat"] / 1000, np.log(o["deg_src"]), np.log(o["deg_dst"]),
        np.nan_to_num(o["prev_success_rate"], nan=0.5), (~np.isnan(o["prev_success_rate"])).astype(float)])
    return X


def node_features(topo):
    n = topo["n"]
    src, dst, capd = np.array(topo["src"]), np.array(topo["dst"]), np.array(topo["capacity"])[np.array(topo["channel"])]
    deg = np.bincount(src, minlength=n).astype(float)
    mean_cap = np.bincount(src, weights=np.log(capd), minlength=n) / np.maximum(deg, 1)
    return np.column_stack([np.log1p(deg), mean_cap, (deg == 1).astype(float)]), src, dst


def propagate(H, src, dst, n, hops=2):
    """Message passing without learned weights: average neighbours' features, `hops` times."""
    deg = np.bincount(src, minlength=n).astype(float)
    out = [H]
    cur = H
    for _ in range(hops):
        agg = np.zeros_like(cur)
        np.add.at(agg, src, cur[dst])
        cur = agg / np.maximum(deg, 1)[:, None]
        out.append(cur)
    return np.hstack(out)


def gnn_features(o, topo, hops=2):
    H0, src, dst = node_features(topo)
    Z = propagate(H0, src, dst, topo["n"], hops)
    s, d = o["src"].astype(int), o["dst"].astype(int)
    return np.hstack([edge_features(o), Z[s], Z[d]])


# ------------------------------------------------------------------ model and metrics
class Logistic:
    """Logistic regression trained with plain gradient descent (L2-regularised)."""

    def __init__(self, l2=1e-3, lr=0.2, epochs=600):
        self.l2, self.lr, self.epochs = l2, lr, epochs

    def fit(self, X, y):
        self.mu, self.sd = X.mean(0), X.std(0) + 1e-9      # fitted on training data only
        Xs = (X - self.mu) / self.sd
        self.w, self.b = np.zeros(X.shape[1]), 0.0
        for _ in range(self.epochs):
            p = 1 / (1 + np.exp(-(Xs @ self.w + self.b)))
            g = p - y
            self.w -= self.lr * (Xs.T @ g / len(y) + self.l2 * self.w)
            self.b -= self.lr * g.mean()
        return self

    def predict_proba(self, X):
        return 1 / (1 + np.exp(-(((X - self.mu) / self.sd) @ self.w + self.b)))


def pr_auc(y, s):
    order = np.argsort(-s)
    y = y[order]
    tp = np.cumsum(y)
    precision = tp / np.arange(1, len(y) + 1)
    return float((precision * y).sum() / max(y.sum(), 1))


def metrics(y, p, thr=0.5):
    pred = (p >= thr).astype(int)
    tpr = (pred[y == 1] == 1).mean() if (y == 1).any() else 0.0
    tnr = (pred[y == 0] == 0).mean() if (y == 0).any() else 0.0
    return {"balanced_acc": round(float((tpr + tnr) / 2), 3), "pr_auc": round(pr_auc(y, p), 3),
            "brier": round(float(np.mean((p - y) ** 2)), 3)}


def split(o, periods):
    return np.isin(o["period"], periods)


def run(cfg: Config = None, outdir: str | None = None, verbose=True):
    cfg = cfg or Config()
    obs, ev, topo = simulate(cfg)
    o, e = table(obs), table(ev)
    y = e["label"].astype(int)
    tr, va, te = split(o, cfg.train_periods), split(o, cfg.val_periods), split(o, cfg.test_periods)
    res = {}
    base_rate = y[tr].mean()
    res["majority (always 'can send')" if base_rate >= 0.5 else "majority (always 'cannot')"] = metrics(y[te], np.full(te.sum(), base_rate))
    res["capacity heuristic 1 − amount/capacity"] = metrics(y[te], 1 - o["amount"][te] / o["capacity"][te])
    Xe = edge_features(o)
    m1 = Logistic().fit(Xe[tr], y[tr])
    res["edge-only logistic regression"] = metrics(y[te], m1.predict_proba(Xe[te]))
    best = None
    for hops in (1, 2, 3):                                   # choose hops on validation only
        Xg = gnn_features(o, topo, hops)
        m = Logistic().fit(Xg[tr], y[tr])
        score = pr_auc(y[va], m.predict_proba(Xg[va]))
        if best is None or score > best[0]:
            best = (score, hops, m, Xg)
    _, hops, m2, Xg = best
    res[f"message passing ({hops}-hop) + logistic head"] = metrics(y[te], m2.predict_proba(Xg[te]))
    # leakage demonstrations (what NOT to do)
    Xleak = np.column_stack([Xe, e["local_balance"] / o["capacity"]])
    m3 = Logistic().fit(Xleak[tr], y[tr])
    res["LEAKY: + hidden balance ratio"] = metrics(y[te], m3.predict_proba(Xleak[te]))
    rng = np.random.default_rng(cfg.seed + 1)
    perm = rng.permutation(len(y))
    rtr, rte = perm[: int(0.7 * len(y))], perm[int(0.7 * len(y)):]
    m4 = Logistic().fit(Xg[rtr], y[rtr])
    res["LEAKY: random split instead of time"] = metrics(y[rte], m4.predict_proba(Xg[rte]))
    summary = {"config": {k: (list(v) if isinstance(v, tuple) else v) for k, v in cfg.__dict__.items()},
               "rows": int(len(y)), "train/val/test rows": [int(tr.sum()), int(va.sum()), int(te.sum())],
               "positive rate (train, test)": [round(float(y[tr].mean()), 3), round(float(y[te].mean()), 3)],
               "chosen hops (validation)": hops, "results (test periods)": res}
    if outdir:
        os.makedirs(outdir, exist_ok=True)
        _write_csv(os.path.join(outdir, "observations.csv"), obs)
        _write_csv(os.path.join(outdir, "evaluator_only.csv"), [{k: r[k] for k in ("period", "dir", "local_balance", "spendable")} for r in ev])
        _write_csv(os.path.join(outdir, "labels.csv"), [{"period": r["period"], "dir": r["dir"], "label": r["label"]} for r in ev])
        with open(os.path.join(outdir, "manifest.json"), "w") as f:
            json.dump({"generator": "bitct.lngraph.simulate", **summary["config"], "rows": summary["rows"],
                       "tables": {"observations.csv": "model inputs (observable at observation time)",
                                  "evaluator_only.csv": "hidden balances — never a model input",
                                  "labels.csv": "1 if spendable(source side) >= amount, reserve 1%"}}, f, indent=2)
        with open(os.path.join(outdir, "results.json"), "w") as f:
            json.dump(summary, f, indent=2)
    if verbose:
        print_summary(summary)
    return summary


def _write_csv(path, rows):
    keys = list(rows[0].keys())
    with open(path, "w") as f:
        f.write(",".join(keys) + "\n")
        for r in rows:
            f.write(",".join("" if (isinstance(r[k], float) and math.isnan(r[k])) else
                             (f"{r[k]:.6g}" if isinstance(r[k], float) else str(r[k])) for k in keys) + "\n")


def print_summary(s):
    print(f"rows {s['rows']}  train/val/test {s['train/val/test rows']}  positive rate train/test {s['positive rate (train, test)']}")
    print(f"{'model (evaluated on later periods)':<44}{'bal.acc':>8}{'PR-AUC':>8}{'Brier':>7}")
    for k, v in s["results (test periods)"].items():
        print(f"{k:<44}{v['balanced_acc']:>8}{v['pr_auc']:>8}{v['brier']:>7}")


def main(argv=None):
    import argparse
    p = argparse.ArgumentParser(prog="lngraph", description=__doc__)
    p.add_argument("--seed", type=int, default=7)
    p.add_argument("--out", default="/lab/lngraph")
    a = p.parse_args(argv)
    run(Config(seed=a.seed), a.out)


if __name__ == "__main__":
    main()

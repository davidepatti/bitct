import os, sys, tempfile, shutil
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from bitct import d17, fixtures_d17 as fx, merkle

def run_cases():
    tmp = tempfile.mkdtemp()
    dbp = os.path.join(tmp, "c.sqlite")
    cases = fx.cases()
    def fresh(start):
        if os.path.exists(dbp): os.remove(dbp)
        db = d17.connect(dbp); fx.prepare_c0(db)
        if start == "C1":
            assert d17.submit(db, cases["R42"]).verdict == d17.ACCEPTED
        return db
    for cid, start, steps, op in fx.EXPECTED:
        db = fresh(start)
        if op == "authority-offline": d17.set_setting(db, "registry_offline", "1")
        if op == "lose-state": db.execute("UPDATE streams SET last_seq=NULL")
        if op == "rotate": d17.enroll(db, "D17", "key-B", 4, fx.PB.hex(), last_seq=0)
        if op == "revoke-then-replace": d17.set_status(db, "D17", "key-A", 3, "revoked")
        for i, (name, want) in enumerate(steps):
            if op == "revoke-then-replace" and i == 1:
                d17.enroll(db, "D17", "key-B", 4, fx.PB.hex(), last_seq=0)
            dec = d17.submit(db, cases[name])
            assert dec.verdict == want, (cid, name, dec.verdict, dec.reason)
            print(f"{cid} {name:<20} {dec.verdict:<17} {dec.reason}")
        st = {(r['device'], r['enrollment']): r['last_seq'] for r in db.execute("SELECT * FROM streams")}
        if cid == "T08": assert st[("D17", 3)] == 42
        if cid == "T04": assert st[("D17", 3)] == 41
        if cid == "T12": assert st[("D17", 3)] == 41
        db.close()
    # batch + receipt round trip
    db = fresh("C1")
    d17.submit(db, cases["R43"])
    bid = d17.make_batch(db)
    r = d17.receipt(db, 1)
    leaf = merkle.leaf_hash(d17.leaf_bytes(r["report"].encode(), bytes.fromhex(r["sig"])))
    assert merkle.root_from_proof(leaf, merkle.path_from_json(r["merkle"]["path"])).hex() == r["merkle"]["root"]
    shutil.rmtree(tmp)
    print("d17 fixture cases OK")

def test_merkle():
    for n in range(1, 20):
        leaves = [bytes([i]) * 3 for i in range(n)]
        hs = [merkle.leaf_hash(x) for x in leaves]
        rt = merkle.root(leaves)
        for i in range(n):
            assert merkle.verify(leaves[i], merkle.proof(hs, i), rt)
            assert not merkle.verify(leaves[i] + b"x", merkle.proof(hs, i), rt)
    print("merkle OK")

if __name__ == "__main__":
    test_merkle(); run_cases()

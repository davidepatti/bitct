import csv, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from bitct import bip340

VECTORS = os.path.join(os.path.dirname(__file__), "bip340-test-vectors.csv")

def test_vectors():
    n = 0
    with open(VECTORS) as f:
        for row in csv.DictReader(f):
            pk = bytes.fromhex(row["public key"]); msg = bytes.fromhex(row["message"])
            sig = bytes.fromhex(row["signature"]); ok = row["verification result"] == "TRUE"
            if row["secret key"]:
                sk = bytes.fromhex(row["secret key"]); aux = bytes.fromhex(row["aux_rand"])
                assert bip340.pubkey_gen(sk) == pk
                assert bip340.sign(sk, msg, aux) == sig, row["index"]
            assert bip340.verify(pk, msg, sig) == ok, row["index"]
            n += 1
    assert n >= 15

if __name__ == "__main__":
    test_vectors(); print("bip340 vectors OK")

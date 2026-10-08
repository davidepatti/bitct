#!/usr/bin/env python3
"""Execute the code cells of a notebook in order without Jupyter (CI smoke test)."""
import json, os, sys
import matplotlib
matplotlib.use("Agg")
nb = json.load(open(sys.argv[1]))
g = {}
for i, c in enumerate(nb["cells"]):
    if c["cell_type"] != "code":
        continue
    lines = "".join(c["source"]).rstrip().split("\n")
    last = lines[-1]
    if last[:1].isspace():
        exec(compile("\n".join(lines), f"cell{i}", "exec"), g)
        continue
    exec(compile("\n".join(lines[:-1]), f"cell{i}", "exec"), g)
    try:
        v = eval(compile(last, f"cell{i}", "eval"), g)
        if v is not None:
            print(str(v)[:800])
    except SyntaxError:
        exec(compile(last, f"cell{i}", "exec"), g)
print("NOTEBOOK OK")

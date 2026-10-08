

# Command-line tools: behave like ordinary Unix tools when piped into `head` (no BrokenPipe traceback).
import os as _os
import sys as _sys
if _os.path.basename(_sys.argv[0] if _sys.argv else "") in {
        "d17", "d17-sim", "d17-fixture", "lab-status", "merkle", "bip340", "addr", "header", "hashdiff",
        "signet-anchor", "ln-fund", "ln-topology", "lnview", "lngraph"}:
    import signal as _signal
    _signal.signal(_signal.SIGPIPE, _signal.SIG_DFL)

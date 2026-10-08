#!/usr/bin/env bash
# Run every lab's student procedure against the local image. Usage: tests/run_all.sh [lab ...]
set -u
cd "$(dirname "$0")/.."
labs=("$@")
[ ${#labs[@]} -eq 0 ] && labs=(dlab00-setup dlab01-auth dlab02-transaction dlab03-structures dlab04-consensus dlab05-wallet dlab06-attest dlab07-anchor dlab08-channel dlab09-routing dlab11-esp32)
fail=0
for l in "${labs[@]}"; do
  python3 tests/run_lab.py "$l" || fail=1
done
exit $fail

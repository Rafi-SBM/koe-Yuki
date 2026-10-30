#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root"
python_bin=${YUKI_PYTHON:-"$root/agent/venv/bin/python"}
npm --prefix frontend ci
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend test
npm --prefix frontend audit --audit-level=moderate
npm --prefix frontend run build
"$python_bin" -m pip check
"$python_bin" -m pytest agent/tests/test_unit.py agent/tests/test_reliability.py -q
"$python_bin" -m compileall -q agent/src
if "$python_bin" -m pip_audit --version >/dev/null 2>&1; then "$python_bin" -m pip_audit; fi
docker compose config --no-interpolate --quiet

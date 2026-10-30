#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
out="$root/.local/huggingface-space"
mkdir -p "$out"
cp "$root/deploy/huggingface/Dockerfile" "$out/Dockerfile"
cp "$root/deploy/huggingface/README.md" "$out/README.md"
cp "$root/agent/requirements.txt" "$root/agent/requirements.lock" "$root/agent/download_models.sh" "$out/"
cp -R "$root/agent/src" "$root/agent/knowledge" "$out/"
find "$out" -type d -name __pycache__ -exec rm -rf {} +
echo "Space files prepared locally in $out"

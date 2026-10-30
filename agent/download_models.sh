#!/bin/sh
set -eu
MODELS_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/models"
mkdir -p "$MODELS_DIR"
MODEL_BASE_URL=${KOKORO_MODEL_BASE_URL:-https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0}
verify() {
  if command -v sha256sum >/dev/null 2>&1; then echo "$2  $1" | sha256sum -c - >/dev/null;
  else echo "$2  $1" | shasum -a 256 -c - >/dev/null; fi
}
download() {
  file="$MODELS_DIR/$1"
  if [ -f "$file" ] && verify "$file" "$2"; then echo "Verified $1"; return; fi
  temp=$(mktemp "$MODELS_DIR/.download.XXXXXX")
  trap 'rm -f "$temp"' EXIT HUP INT TERM
  curl --fail --location --retry 3 --retry-delay 2 --connect-timeout 15 --max-time 600 --output "$temp" "$MODEL_BASE_URL/$1"
  verify "$temp" "$2"
  mv "$temp" "$file"
  chmod 644 "$file"
  trap - EXIT HUP INT TERM
  echo "Downloaded and verified $1"
}
download kokoro-v1.0.onnx 7d5df8ecf7d4b1878015a32686053fd0eebe2bc377234608764cc0ef3636a6c5
download voices-v1.0.bin bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ "$(uname -s)" == "Linux" && "$(uname -m)" == "aarch64" ]]; then
  echo "Building Debian package (arm64) on native Linux..."
  npm run build:linux:deb:arm64
else
  echo "Building Debian package (arm64) via Docker linux/arm64..."
  docker run --rm --platform linux/arm64 \
    -v "$ROOT_DIR":/workspace \
    -w /tmp \
    node:20-bookworm \
    bash -lc 'set -euo pipefail
      apt-get update
      apt-get install -y --no-install-recommends python3 make g++ ca-certificates
      cp -a /workspace/. /tmp/project
      cd /tmp/project
      npm ci
      npm run build:linux:deb:arm64
      mkdir -p /workspace/dist/release
      cp -a dist/release/. /workspace/dist/release/
    '
fi

echo "Done."
echo "Artifacts available in: $ROOT_DIR/dist/release"

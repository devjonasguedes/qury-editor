#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ "$(uname -s)" == "Linux" && "$(uname -m)" == "x86_64" ]]; then
  echo "Building Debian package (x64) on native Linux..."
  npm run build:linux:deb
else
  echo "Building Debian package (x64) via Docker linux/amd64..."
  docker run --rm --platform linux/amd64 \
    -v "$ROOT_DIR":/workspace \
    -w /tmp \
    node:20-bookworm \
    bash -lc 'set -euo pipefail
      apt-get update
      apt-get install -y --no-install-recommends python3 make g++ ca-certificates
      cp -a /workspace/. /tmp/project
      cd /tmp/project
      npm ci
      npm run build:linux:deb
      mkdir -p /workspace/dist/release
      cp -a dist/release/. /workspace/dist/release/
    '
fi

echo "Done."
echo "Artifacts available in: $ROOT_DIR/dist/release"

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

APP_NAME="Qury Editor"
ZIP_ROOT_NAME="qury-windows"
DIST_ROOT="$ROOT_DIR/dist/win32-x64"
ELECTRON_UNPACK_DIR="$DIST_ROOT/$ZIP_ROOT_NAME"
APP_RESOURCES="$ELECTRON_UNPACK_DIR/resources/app"

echo "Building app source..."
npm run build

echo "Including main process local modules..."
mkdir -p "$ROOT_DIR/out/main/drivers"
rsync -a "$ROOT_DIR/src/drivers/" "$ROOT_DIR/out/main/drivers/"

ELECTRON_VERSION="$(node -p "require('electron/package.json').version")"
echo "Downloading Electron v$ELECTRON_VERSION for win32-x64..."
ELECTRON_ZIP="$(
  node -e "
    const { downloadArtifact } = require('@electron/get');
    const version = process.argv[1];
    downloadArtifact({
      version,
      artifactName: 'electron',
      platform: 'win32',
      arch: 'x64'
    }).then((zipPath) => {
      process.stdout.write(zipPath);
    }).catch((err) => {
      console.error(err && err.message ? err.message : err);
      process.exit(1);
    });
  " "$ELECTRON_VERSION"
)"

echo "Preparing Windows app bundle..."
rm -rf "$DIST_ROOT"
mkdir -p "$ELECTRON_UNPACK_DIR"
unzip -q "$ELECTRON_ZIP" -d "$ELECTRON_UNPACK_DIR"

if [[ -f "$ELECTRON_UNPACK_DIR/electron.exe" ]]; then
  mv "$ELECTRON_UNPACK_DIR/electron.exe" "$ELECTRON_UNPACK_DIR/$APP_NAME.exe"
fi

mkdir -p "$APP_RESOURCES"
rsync -a "$ROOT_DIR/out/" "$APP_RESOURCES/out/"

node -e "const fs=require('fs'); const pkg=require('./package.json'); const deps={...(pkg.dependencies||{})}; delete deps.electron; const out={name:pkg.name,version:pkg.version,main:'out/main/index.js',private:true,dependencies:deps}; fs.writeFileSync(process.argv[1], JSON.stringify(out,null,2)+'\n');" "$APP_RESOURCES/package.json"

echo "Installing production dependencies for win32-x64..."
npm install \
  --omit=dev \
  --no-package-lock \
  --os=win32 \
  --cpu=x64 \
  --prefix "$APP_RESOURCES"

echo "Creating zip artifact..."
ditto -c -k --sequesterRsrc --keepParent "$ELECTRON_UNPACK_DIR" "$DIST_ROOT/$ZIP_ROOT_NAME.zip"

echo "Done."
echo "Windows app folder: $ELECTRON_UNPACK_DIR"
echo "Zip file: $DIST_ROOT/$ZIP_ROOT_NAME.zip"

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

APP_NAME="Qury Editor"
APP_ID="com.qury.editor"
DIST_ROOT="$ROOT_DIR/dist/mac-arm64"
APP_BUNDLE="$DIST_ROOT/$APP_NAME.app"
APP_RESOURCES="$APP_BUNDLE/Contents/Resources/app"
PLIST_FILE="$APP_BUNDLE/Contents/Info.plist"
ELECTRON_TEMPLATE="$ROOT_DIR/node_modules/electron/dist/Electron.app"
ELECTRON_BINARY="$ELECTRON_TEMPLATE/Contents/MacOS/Electron"

if [[ ! -d "$ELECTRON_TEMPLATE" ]]; then
  echo "Electron template not found at $ELECTRON_TEMPLATE"
  echo "Run 'npm install' first."
  exit 1
fi

if [[ ! -f "$ELECTRON_BINARY" ]]; then
  echo "Electron binary not found at $ELECTRON_BINARY"
  exit 1
fi

if ! file "$ELECTRON_BINARY" | grep -q "arm64"; then
  echo "The installed Electron binary is not arm64."
  echo "Install Electron for Apple Silicon and try again."
  exit 1
fi

echo "Building app source..."
npm run build

echo "Including main process local modules..."
mkdir -p "$ROOT_DIR/out/main/drivers"
rsync -a "$ROOT_DIR/src/drivers/" "$ROOT_DIR/out/main/drivers/"

echo "Preparing macOS app bundle..."
rm -rf "$DIST_ROOT"
mkdir -p "$DIST_ROOT"
cp -R "$ELECTRON_TEMPLATE" "$APP_BUNDLE"

mv "$APP_BUNDLE/Contents/MacOS/Electron" "$APP_BUNDLE/Contents/MacOS/$APP_NAME"
plutil -replace CFBundleExecutable -string "$APP_NAME" "$PLIST_FILE"
plutil -replace CFBundleName -string "$APP_NAME" "$PLIST_FILE"
plutil -replace CFBundleDisplayName -string "$APP_NAME" "$PLIST_FILE"
plutil -replace CFBundleIdentifier -string "$APP_ID" "$PLIST_FILE"

mkdir -p "$APP_RESOURCES"
rsync -a "$ROOT_DIR/out/" "$APP_RESOURCES/out/"
rsync -a "$ROOT_DIR/node_modules/" "$APP_RESOURCES/node_modules/"

node -e "const fs=require('fs'); const pkg=require('./package.json'); const out={name:pkg.name,version:pkg.version,main:'out/main/index.js',private:true,dependencies:pkg.dependencies}; fs.writeFileSync(process.argv[1], JSON.stringify(out,null,2)+'\n');" "$APP_RESOURCES/package.json"

echo "Creating DMG artifact..."
DMG_PATH="$DIST_ROOT/qury-mac.dmg"
hdiutil create \
  -volname "$APP_NAME" \
  -srcfolder "$APP_BUNDLE" \
  -ov \
  -format UDZO \
  "$DMG_PATH"

echo "Creating zip artifact (DMG inside)..."
ditto -c -k --sequesterRsrc --keepParent "$DMG_PATH" "$DIST_ROOT/qury-mac.zip"
rm -f "$DMG_PATH"

echo "Done."
echo "App bundle: $APP_BUNDLE"
echo "Zip file: $DIST_ROOT/qury-mac.zip"

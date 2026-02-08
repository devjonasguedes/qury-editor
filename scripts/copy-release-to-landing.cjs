const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const LANDING_DIR = path.join(ROOT_DIR, "public", "landing-page");

const target = process.argv[2];
if (!target) {
  console.error("Missing build target. Use: mac-arm64, win-x64, linux-x64");
  process.exit(1);
}

const targets = {
  "mac-arm64": {
    platform: "mac",
    arch: "arm64",
    ext: "zip",
    fixedName: "qury-mac.zip"
  },
  "win-x64": {
    platform: "win",
    arch: "x64",
    ext: "zip",
    fixedName: "qury-windows.zip"
  },
  "linux-x64": {
    platform: "linux",
    arch: "x64",
    archAliases: ["amd64"],
    ext: "deb",
    fixedName: "qury-linux.deb"
  }
};

const selected = targets[target];
if (!selected) {
  console.error(`Unsupported build target: ${target}`);
  process.exit(1);
}

const packageJsonPath = path.join(ROOT_DIR, "package.json");
const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const productName =
  (pkg.build && pkg.build.productName) || pkg.productName || pkg.name || "App";

const archCandidates = [selected.arch].concat(selected.archAliases || []);
const sourcePath = archCandidates
  .map((arch) => {
    const fileName = `${productName}-${selected.platform}-${arch}.${selected.ext}`;
    return { arch, fileName, path: path.join(ROOT_DIR, "dist", "release", fileName) };
  })
  .find((entry) => fs.existsSync(entry.path));

if (!sourcePath) {
  const attempted = archCandidates
    .map((arch) => path.join(ROOT_DIR, "dist", "release", `${productName}-${selected.platform}-${arch}.${selected.ext}`))
    .join("\n");
  console.error(`Build artifact not found. Tried:\n${attempted}`);
  process.exit(1);
}

fs.mkdirSync(LANDING_DIR, { recursive: true });
const destPath = path.join(LANDING_DIR, selected.fixedName);
fs.copyFileSync(sourcePath.path, destPath);

console.log(`Copied ${sourcePath.fileName} to ${destPath}`);

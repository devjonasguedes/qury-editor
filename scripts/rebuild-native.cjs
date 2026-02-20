const path = require("path");

let rebuild;
try {
  ({ rebuild } = require("@electron/rebuild"));
} catch (err) {
  console.error("[rebuild-native] Missing @electron/rebuild.", err?.message || err);
  process.exit(1);
}

const pkg = require(path.join(process.cwd(), "package.json"));
const electronSpec =
  (pkg.devDependencies && pkg.devDependencies.electron) ||
  (pkg.dependencies && pkg.dependencies.electron) ||
  "";
const versionMatch = String(electronSpec).match(/\d+\.\d+\.\d+/);
const electronVersion = versionMatch ? versionMatch[0] : undefined;
const arch = process.env.npm_config_arch || process.arch;

const run = async () => {
  try {
    await rebuild({
      buildPath: process.cwd(),
      electronVersion,
      arch,
      force: true,
      onlyModules: ["better-sqlite3"],
    });
    console.log(`[rebuild-native] OK (arch=${arch}, electron=${electronVersion || "auto"})`);
  } catch (err) {
    console.error("[rebuild-native] Failed:", err?.message || err);
    process.exit(1);
  }
};

run();

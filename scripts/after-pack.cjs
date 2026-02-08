const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

function setPlistString(plistPath, key, value) {
  if (!fs.existsSync(plistPath)) return;
  const safeValue = String(value || "").replace(/"/g, '\\"');
  try {
    execFileSync(
      "/usr/libexec/PlistBuddy",
      ["-c", `Set :${key} "${safeValue}"`, plistPath],
      { stdio: "ignore" },
    );
    return;
  } catch (_) {
    // fallback to Add when key does not exist
  }
  try {
    execFileSync(
      "/usr/libexec/PlistBuddy",
      ["-c", `Add :${key} string "${safeValue}"`, plistPath],
      { stdio: "ignore" },
    );
  } catch (_) {
    // best effort
  }
}

module.exports = async function afterPack(context) {
  if (process.platform !== "darwin") return;
  if (!context || !context.appOutDir || !context.packager || !context.packager.appInfo) return;

  const productName = String(context.packager.appInfo.productName || "App");
  const productFilename = String(context.packager.appInfo.productFilename || productName);
  const appBundlePath = path.join(context.appOutDir, `${productFilename}.app`);
  const mainPlist = path.join(appBundlePath, "Contents", "Info.plist");

  setPlistString(mainPlist, "CFBundleName", productName);
  setPlistString(mainPlist, "CFBundleDisplayName", productName);

  const frameworksDir = path.join(appBundlePath, "Contents", "Frameworks");
  const helperSuffixes = ["", " (GPU)", " (Renderer)", " (Plugin)"];
  helperSuffixes.forEach((suffix) => {
    const helperName = `${productName} Helper${suffix}`;
    const helperPlist = path.join(
      frameworksDir,
      `${helperName}.app`,
      "Contents",
      "Info.plist",
    );
    setPlistString(helperPlist, "CFBundleName", helperName);
    setPlistString(helperPlist, "CFBundleDisplayName", helperName);
  });
};

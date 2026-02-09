const fs = require("fs");
const path = require("path");
const archiver = require("archiver");

function createZip(outZipPath, addFn) {
  return new Promise((resolve, reject) => {
    fs.rmSync(outZipPath, { force: true });
    const output = fs.createWriteStream(outZipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", resolve);
    output.on("error", reject);
    archive.on("error", reject);

    archive.pipe(output);
    addFn(archive);
    archive.finalize();
  });
}

async function zipSingleFile(inputFile, outZipPath, entryName) {
  await createZip(outZipPath, (archive) => {
    archive.file(inputFile, { name: entryName || path.basename(inputFile) });
  });
}

async function zipDirectory(inputDir, outZipPath, rootName) {
  await createZip(outZipPath, (archive) => {
    archive.directory(inputDir, rootName);
  });
}

module.exports = async function afterAllArtifactBuild(context) {
  if (!context || !context.outDir) return;

  const outDir = context.outDir;
  const artifactPaths = Array.isArray(context.artifactPaths)
    ? context.artifactPaths.map(String)
    : [];

  const dmgPath = artifactPaths.find((p) => p.toLowerCase().endsWith(".dmg"));
  if (dmgPath && fs.existsSync(dmgPath)) {
    const macZip = path.join(outDir, "qury-mac.zip");
    await zipSingleFile(dmgPath, macZip, "qury-mac.dmg");
    console.log(`Created ${macZip}`);
  }

  const winUnpacked = context.appOutDir && fs.existsSync(context.appOutDir)
    ? context.appOutDir
    : path.join(outDir, "win-unpacked");

  if (fs.existsSync(winUnpacked)) {
    const winZip = path.join(outDir, "qury-windows.zip");
    await zipDirectory(winUnpacked, winZip, "qury-windows");
    console.log(`Created ${winZip}`);
  }
};

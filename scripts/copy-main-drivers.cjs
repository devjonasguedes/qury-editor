#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const sourceDir = path.join(rootDir, 'src', 'drivers');
const targetDir = path.join(rootDir, 'out', 'main', 'drivers');

if (!fs.existsSync(sourceDir)) {
  console.error(`Drivers directory not found: ${sourceDir}`);
  process.exit(1);
}

fs.rmSync(targetDir, { recursive: true, force: true });
fs.mkdirSync(targetDir, { recursive: true });
fs.cpSync(sourceDir, targetDir, { recursive: true });

console.log(`Copied drivers to ${targetDir}`);

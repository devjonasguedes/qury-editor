#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import os from 'os';

const args = process.argv.slice(2);
const rootArg = args.find((arg) => arg.startsWith('--root='));
const outArg = args.find((arg) => arg.startsWith('--out='));
const maxDepthArg = args.find((arg) => arg.startsWith('--depth='));

const ROOT = rootArg ? rootArg.split('=')[1] : path.join(os.homedir(), 'Library', 'Application Support');
const OUT_PATH = outArg ? outArg.split('=')[1] : path.join(process.cwd(), 'recovery-localstorage.json');
const MAX_DEPTH = maxDepthArg ? Number(maxDepthArg.split('=')[1]) : 6;

const KEY_PREFIX = 'sqlEditor.';
const EXPECTED_KEYS = [
  'sqlEditor.recentConnections',
  'sqlEditor.theme',
  'sqlEditor.sidebarWidth',
  'sqlEditor.sidebarView',
  'sqlEditor.queryTimeout',
  'sqlEditor.editorHeight',
  'sqlEditor.tabsState'
];

function isLikelyJson(value) {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

function safeParseJson(value) {
  if (!isLikelyJson(value)) return null;
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

function shouldSkipDir(dir) {
  const name = path.basename(dir).toLowerCase();
  return (
    name === 'caches' ||
    name === 'cache' ||
    name === 'logs' ||
    name === 'trash' ||
    name === '.git' ||
    name === 'node_modules'
  );
}

function findLeveldbDirs(root, maxDepth) {
  const result = [];
  const stack = [{ dir: root, depth: 0 }];
  while (stack.length) {
    const { dir, depth } = stack.pop();
    if (depth > maxDepth) continue;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const next = path.join(dir, entry.name);
      if (shouldSkipDir(next)) continue;
      if (entry.name === 'Local Storage') {
        const leveldb = path.join(next, 'leveldb');
        if (fs.existsSync(leveldb) && fs.statSync(leveldb).isDirectory()) {
          result.push(leveldb);
          continue;
        }
      }
      stack.push({ dir: next, depth: depth + 1 });
    }
  }
  return Array.from(new Set(result));
}

async function tryOpenWithLevel(leveldbDir) {
  let Level = null;
  try {
    const mod = await import('level');
    Level = mod.Level || mod.default;
  } catch (_) {
    return null;
  }
  if (!Level) return null;

  const db = new Level(leveldbDir, { keyEncoding: 'buffer', valueEncoding: 'buffer' });
  const entries = [];
  try {
    for await (const [keyBuf, valueBuf] of db.iterator()) {
      const keyStr = Buffer.isBuffer(keyBuf) ? keyBuf.toString('utf8') : String(keyBuf || '');
      const valueStr = Buffer.isBuffer(valueBuf) ? valueBuf.toString('utf8') : String(valueBuf || '');
      if (!keyStr.includes(KEY_PREFIX) && !valueStr.includes(KEY_PREFIX)) continue;
      const parsed = safeParseJson(valueStr);
      entries.push({
        key: keyStr,
        value: valueStr,
        parsed
      });
    }
  } catch (err) {
    entries.push({ error: err && err.message ? err.message : 'level_read_failed' });
  } finally {
    try {
      await db.close();
    } catch (_) {
      // ignore
    }
  }
  return entries;
}

function scanBufferForKey(buffer, key) {
  const hits = [];
  const keyBuf = Buffer.from(key);
  let idx = 0;
  while (idx < buffer.length) {
    const pos = buffer.indexOf(keyBuf, idx);
    if (pos === -1) break;
    const start = pos;
    let end = start;
    const limit = Math.min(buffer.length, start + 512);
    while (end < limit) {
      const byte = buffer[end];
      if (byte === 0) break;
      if (byte < 9) break;
      end += 1;
    }
    const snippet = buffer.toString('utf8', start, end);
    hits.push({ offset: start, snippet });
    idx = end + 1;
  }
  return hits;
}

function fallbackScan(leveldbDir) {
  const files = fs.readdirSync(leveldbDir).filter((name) => name.endsWith('.log') || name.endsWith('.ldb') || name.endsWith('.sst'));
  const hits = [];
  for (const name of files) {
    const filePath = path.join(leveldbDir, name);
    let buf = null;
    try {
      buf = fs.readFileSync(filePath);
    } catch {
      continue;
    }
    const found = [];
    for (const key of EXPECTED_KEYS) {
      const keyHits = scanBufferForKey(buf, key);
      keyHits.forEach((hit) => {
        found.push({ key, snippet: hit.snippet, offset: hit.offset });
      });
    }
    if (found.length) {
      hits.push({ file: filePath, matches: found });
    }
  }
  return hits;
}

async function main() {
  if (!fs.existsSync(ROOT)) {
    console.error(`Root not found: ${ROOT}`);
    process.exit(1);
  }

  const leveldbDirs = findLeveldbDirs(ROOT, MAX_DEPTH);
  if (leveldbDirs.length === 0) {
    console.log('Nenhum LevelDB encontrado.');
    return;
  }

  const output = {
    root: ROOT,
    scannedAt: new Date().toISOString(),
    leveldbDirs,
    results: []
  };

  let usedLevel = false;

  for (const dir of leveldbDirs) {
    const levelEntries = await tryOpenWithLevel(dir);
    if (levelEntries) {
      usedLevel = true;
      const filtered = levelEntries.filter((entry) => entry && entry.key && entry.key.includes(KEY_PREFIX));
      output.results.push({
        dir,
        method: 'level',
        entries: filtered
      });
      continue;
    }
    const fallback = fallbackScan(dir);
    if (fallback.length) {
      output.results.push({
        dir,
        method: 'raw-scan',
        entries: fallback
      });
    }
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2), 'utf8');
  console.log(`Scan finalizado. Resultado em: ${OUT_PATH}`);
  if (!usedLevel) {
    console.log('Dica: instale "level" para uma recuperação mais completa: npm i -D level');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

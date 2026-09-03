#!/usr/bin/env node
// Mirrors the authoring provider's shared content into every other provider.
// Cursor is the source of truth; run this after editing skills, commands or assets.
// Usage: node scripts/sync-providers.mjs [--check]

import { readdirSync, statSync, mkdirSync, copyFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = 'cursor';
const TARGETS = ['grok', 'agent-plugins'];
const SHARED = ['skills', 'commands', 'assets'];
const checkOnly = process.argv.includes('--check');

const pluginDir = (provider) => join(root, 'providers', provider, 'plugin');

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

let drift = 0;
let copied = 0;

for (const target of TARGETS) {
  for (const shared of SHARED) {
    const from = join(pluginDir(SOURCE), shared);
    const to = join(pluginDir(target), shared);
    const sourceFiles = walk(from);

    for (const file of sourceFiles) {
      const dest = join(to, relative(from, file));
      const same = existsSync(dest) && readFileSync(dest).equals(readFileSync(file));
      if (same) continue;
      drift += 1;
      if (checkOnly) {
        console.error(`drift: ${relative(root, dest)}`);
        continue;
      }
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(file, dest);
      copied += 1;
    }

    // Remove files that no longer exist in the source.
    const keep = new Set(sourceFiles.map((f) => join(to, relative(from, f))));
    for (const stale of walk(to)) {
      if (keep.has(stale)) continue;
      drift += 1;
      if (checkOnly) {
        console.error(`stale: ${relative(root, stale)}`);
        continue;
      }
      rmSync(stale);
    }
  }
}

if (checkOnly) {
  if (drift > 0) {
    console.error(`\n${drift} file(s) out of sync. Run: node scripts/sync-providers.mjs`);
    process.exit(1);
  }
  console.log('providers in sync');
} else {
  console.log(`synced ${copied} file(s) from ${SOURCE} to ${TARGETS.join(', ')}`);
}

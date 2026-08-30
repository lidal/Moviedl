#!/usr/bin/env node
/**
 * Collapse the app into a single self-contained HTML file at dist/typecast.html.
 *
 *   npm run bundle
 *
 * There is no bundler dependency and no transpiling. Every module is stripped
 * of its import/export keywords and concatenated in dependency order into one
 * `<script type="module">`, which works because the modules share no top-level
 * names — a fact this script verifies rather than assumes, and refuses to build
 * if it ever stops being true.
 *
 * The output is what gets published or dropped onto a static host; the
 * multi-file source stays the thing you edit.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = join(ROOT, 'src/main.js');

/* ------------------------------------------------------------------ *
 * Resolve the module graph, depth-first, so dependencies come first
 * ------------------------------------------------------------------ */

const IMPORT_RE = /^\s*import\s+(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"];?\s*$/gm;

const order = [];
const seen = new Set();
const visiting = new Set();

async function walk(file) {
  const path = resolve(file);
  if (seen.has(path)) return;
  if (visiting.has(path)) {
    throw new Error(`Import cycle through ${path} — the flat bundle cannot express it.`);
  }
  visiting.add(path);

  const source = await readFile(path, 'utf8');
  for (const match of source.matchAll(IMPORT_RE)) {
    const spec = match[1];
    if (!spec.startsWith('.')) throw new Error(`Bare import "${spec}" in ${path}`);
    await walk(resolve(dirname(path), spec));
  }

  visiting.delete(path);
  seen.add(path);
  order.push({ path, source });
}

await walk(ENTRY);

/* ------------------------------------------------------------------ *
 * Strip module syntax and check for collisions
 * ------------------------------------------------------------------ */

const DECL_RE = /^(?:export\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm;

const owners = new Map();
const chunks = [];

for (const { path, source } of order) {
  const rel = path.slice(ROOT.length + 1);

  for (const [, name] of source.matchAll(DECL_RE)) {
    const previous = owners.get(name);
    if (previous && previous !== rel) {
      throw new Error(
        `Top-level name "${name}" is declared in both ${previous} and ${rel}.\n` +
        `A flat bundle cannot keep them apart — rename one, or teach this script ` +
        `to scope modules.`,
      );
    }
    owners.set(name, rel);
  }

  const body = source
    .replace(IMPORT_RE, '')                    // drop imports; everything is in scope
    .replace(/^\s*export\s+\{[^}]*\};?\s*$/gm, '') // drop re-export lists
    .replace(/^(\s*)export\s+/gm, '$1')        // unwrap `export const/function/...`
    .trim();

  chunks.push(`/* ==== ${rel} ==== */\n${body}`);
}

/* ------------------------------------------------------------------ *
 * Inline into the page
 * ------------------------------------------------------------------ */

const html = await readFile(join(ROOT, 'index.html'), 'utf8');
const css = await readFile(join(ROOT, 'styles.css'), 'utf8');

// `</script>` inside a string literal would close the tag early.
const script = chunks.join('\n\n').replace(/<\/script>/gi, '<\\/script>');

const CSS_TAG = '<link rel="stylesheet" href="styles.css">';
const JS_TAG = '<script type="module" src="src/main.js"></script>';

for (const tag of [CSS_TAG, JS_TAG]) {
  if (!html.includes(tag)) {
    throw new Error(`index.html no longer contains ${tag} — bundler needs updating.`);
  }
}

const out = html
  .replace(CSS_TAG, `<style>\n${css}\n</style>`)
  .replace(JS_TAG, `<script type="module">\n${script}\n</script>`);

await mkdir(join(ROOT, 'dist'), { recursive: true });
await writeFile(join(ROOT, 'dist/typecast.html'), out);

/*
 * Second output: the same page as a body fragment, for hosts that wrap content
 * in their own document skeleton (the Artifact viewer does). Publishing the
 * standalone file into one of those nests <html> inside <html>.
 */
const title = out.match(/<title>[\s\S]*?<\/title>/i)?.[0] ?? '';
const style = out.match(/<style>[\s\S]*?<\/style>/i)?.[0] ?? '';
const body = out.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1];

if (!title || !style || !body) {
  throw new Error('Could not split the page into title/style/body for the fragment build.');
}

const fragment = `${title}\n${style}\n${body.trim()}\n`;
await writeFile(join(ROOT, 'dist/typecast.fragment.html'), fragment);

const kb = (n) => (Buffer.byteLength(n) / 1024).toFixed(0);
console.log(`dist/typecast.html          ${kb(out)} KB  standalone document`);
console.log(`dist/typecast.fragment.html ${kb(fragment)} KB  body fragment`);
console.log(`${order.length} modules inlined, 0 external requests`);

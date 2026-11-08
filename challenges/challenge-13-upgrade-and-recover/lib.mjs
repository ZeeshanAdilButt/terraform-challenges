// Shared helpers for challenge 13. Plain Node, no npm packages.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { tf, PIN } from '../../toolkit/tf.js';
import { run as rawRun, cleanup, leftovers } from '../../toolkit/docker.js';

export const N = 13;

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** docker, tried again when the Docker CLI crashes now and then ("fatal error: unexpected signal") on a busy machine. */
export function run(args, opts) {
  let r;
  for (let i = 0; i < 4; i += 1) {
    r = rawRun(args, opts);
    if (r.code === 0 || !/fatal error|unexpected signal|EOF|timed out/.test(r.stderr)) return r;
    sleep(1500);
  }
  return r;
}

/** cleanup(N) until nothing labelled is left (at most 4 rounds). Returns what was removed and what is left. */
export function cleanAll() {
  let removed = { containers: [], networks: [], volumes: [] };
  let left = { containers: 1, networks: 1, volumes: 1 };
  for (let i = 0; i < 4; i += 1) {
    const r = cleanup(N);
    removed = { containers: [...removed.containers, ...r.containers], networks: [...removed.networks, ...r.networks], volumes: [...removed.volumes, ...r.volumes] };
    left = leftovers(N);
    if (left.containers + left.networks + left.volumes === 0) break;
    sleep(1500);
  }
  return { removed, left };
}

/**
 * Run Terraform in a folder. When the shared plugin cache was busy (several runs on one machine install the same
 * provider at once) the run fails with a message about plugins; then we run `init` again and repeat.
 * Pass { docker: true } for folders that use the Docker provider.
 */
export function tfx(args, cwd, opts = {}) {
  const busy = /Failed to install provider|no version is selected|Inconsistent dependency lock file|Required plugins are not installed|text file busy/;
  let r;
  for (let i = 0; i < 4; i += 1) {
    r = tf(args, { cwd, ...opts });
    if (r.code === 0 || !busy.test(r.out)) return r;
    sleep(3000);
    if (args[0] !== 'init') tf(['init'], { cwd, ...opts });
  }
  return r;
}

/** Run fn with another tool (terraform or tofu). */
export function withTool(tool, fn) {
  const old = process.env.TFC_TOOL;
  process.env.TFC_TOOL = tool;
  try {
    return fn();
  } finally {
    if (old === undefined) delete process.env.TFC_TOOL;
    else process.env.TFC_TOOL = old;
  }
}

/** Run fn with another Terraform release (a pinned official image). Always uses the container, whatever TFC_MODE says. */
export function withTerraformImage(image, fn) {
  const old = PIN.terraform.image;
  const oldMode = process.env.TFC_MODE;
  PIN.terraform.image = image;
  process.env.TFC_MODE = 'docker';
  try {
    return withTool('terraform', fn);
  } finally {
    PIN.terraform.image = old;
    if (oldMode === undefined) delete process.env.TFC_MODE;
    else process.env.TFC_MODE = oldMode;
  }
}

/** Keep the lines of a text that match a pattern, at most max of them. */
export function grep(text, re, max = 25) {
  return text.split('\n').filter((l) => re.test(l)).slice(0, max).join('\n');
}

/** The first error block of an output, without blank lines: from the line that starts with Error up to max lines. */
export function errorBlock(text, max = 8) {
  const lines = text.split('\n');
  const i = lines.findIndex((l) => /^Error:/.test(l));
  if (i < 0) return '';
  const out = [];
  for (const l of lines.slice(i)) {
    if (l.trim() === '') {
      if (out.length > 1) break;
      continue;
    }
    out.push(l);
    if (out.length >= max) break;
  }
  return out.join('\n');
}

export const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');

/** Copy the .tf files, the lock file and the variable files of one folder into another folder, creating it. */
export function copyTf(from, to, { skip = [], keepLock = true } = {}) {
  mkdirSync(to, { recursive: true });
  for (const f of readdirSync(from)) {
    const ok = f.endsWith('.tf') || f.endsWith('.txt') || f.endsWith('.tfvars') || f.endsWith('.tfvars.json') || (keepLock && f === '.terraform.lock.hcl');
    if (ok && !skip.includes(f)) copyFileSync(join(from, f), join(to, f));
  }
}

/** Plan counts: "Plan: 1 to add, 0 to change, 1 to destroy." Also "No changes." gives all zeros. */
export function counts(text) {
  const m = /Plan: (?:(\d+) to import, )?(\d+) to add, (\d+) to change, (\d+) to destroy/.exec(text);
  if (m) return { import: Number(m[1] || 0), add: +m[2], change: +m[3], destroy: +m[4] };
  return /No changes\./.test(text) ? { import: 0, add: 0, change: 0, destroy: 0 } : null;
}

/** Apply counts: "Apply complete! Resources: 2 added, 0 changed, 1 destroyed." */
export function applied(text) {
  const m = /Apply complete! Resources: (?:(\d+) imported, )?(\d+) added, (\d+) changed, (\d+) destroyed/.exec(text);
  return m ? { imported: Number(m[1] || 0), added: +m[2], changed: +m[3], destroyed: +m[4] } : null;
}

/** What `terraform validate -json` says: { warnings, errors, summaries }. */
export function validateJson(cwd, opts = {}) {
  let last;
  for (let i = 0; i < 3; i += 1) {
    const r = tfx(['validate', '-json'], cwd, opts);
    try {
      const j = JSON.parse(r.stdout);
      last = { warnings: j.warning_count, errors: j.error_count, summaries: j.diagnostics.map((d) => `${d.severity}: ${d.summary}`) };
      if (j.error_count === 0) return last;
    } catch {
      last = { warnings: -1, errors: -1, summaries: [r.out.slice(0, 300)] };
    }
    // An error here is a busy plugin cache, not a finding: initialise again and ask again.
    sleep(3000);
    tf(['init'], { cwd, ...opts });
  }
  return last;
}

/** The version and constraints lines of one provider in a lock file. */
export function lockInfo(text, source) {
  const start = text.indexOf(`provider "${source}"`);
  if (start < 0) return null;
  const block = text.slice(start, text.indexOf('\n}\n', start));
  return {
    version: /^\s*version\s*=\s*"([^"]+)"/m.exec(block)?.[1] ?? null,
    constraints: /^\s*constraints\s*=\s*"([^"]+)"/m.exec(block)?.[1] ?? null,
    h1: (block.match(/"h1:/g) || []).length,
    zh: (block.match(/"zh:/g) || []).length,
  };
}

/** terraform_version written in a state file, or null. */
export function stateVersion(cwd) {
  const t = read(join(cwd, 'terraform.tfstate'));
  try {
    return JSON.parse(t).terraform_version ?? null;
  } catch {
    return null;
  }
}

/**
 * Apply a part's before/ folder in work/legacy (the way the team did before the upgrade) and hand its state file and
 * lock file to work/. Returns the apply result.
 */
export function applyLegacy(partPath, work, opts = {}) {
  const legacy = join(work, 'legacy');
  mkdirSync(legacy, { recursive: true });
  for (const f of readdirSync(join(partPath, 'before'))) copyFileSync(join(partPath, 'before', f), join(legacy, f));
  const init = tfx(['init'], legacy, opts);
  if (init.code !== 0) return init;
  const apply = tfx(['apply', '-auto-approve'], legacy, opts);
  if (apply.code === 0) {
    copyFileSync(join(legacy, 'terraform.tfstate'), join(work, 'terraform.tfstate'));
    copyFileSync(join(legacy, '.terraform.lock.hcl'), join(work, '.terraform.lock.hcl'));
    for (const f of readdirSync(legacy)) if (f.endsWith('.txt')) copyFileSync(join(legacy, f), join(work, f));
  }
  return apply;
}

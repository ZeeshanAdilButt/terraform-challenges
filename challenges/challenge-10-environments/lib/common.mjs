// Helpers shared by the three parts of challenge 10. Plain Node, no npm packages.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { tfAsync } from '../../../toolkit/tf.js';
import { run } from '../../../toolkit/docker.js';

export const N = 10;

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*m/g;
export const clean = (s) => String(s).replace(ANSI, '').replace(/\r\n/g, '\n');

/**
 * Run Terraform in a folder without blocking the event loop (a state server may live in this process).
 * Returns { code, out } with colour codes removed (the workspace commands ignore -no-color).
 * If another challenge is installing the same provider into the shared plugin cache at that moment,
 * Terraform can say the installed plugins do not match the lock file; an init and a retry fix it.
 */
export async function terra(cwd, args, opts = {}) {
  const go = async () => {
    const r = await tfAsync(args, { cwd, docker: true, ...opts });
    return { code: r.code, out: clean(r.out) };
  };
  let r = await go();
  for (let i = 0; i < 4 && args[0] !== 'init' && /installed provider plugins are not consistent|Required plugins are not installed|doesn.?t match any of the checksums|Failed to install provider from shared cache|does not match any of the checksums|text file busy/.test(r.out); i++) {
    await new Promise((ok) => setTimeout(ok, 5000 * (i + 1)));
    const init = await tfAsync(['init', '-input=false', ...(opts.initArgs || [])], { cwd, docker: true, ...opts });
    if (init.code === 0) r = await go();
  }
  return r;
}

/**
 * terraform init with retries. Several challenges share one plugin cache folder, and a provider that another
 * run is installing at that moment can make init fail once (for example "text file busy"). Try again.
 */
export async function initWork(cwd, extra = [], opts = {}) {
  let r;
  for (let i = 0; i < 6; i++) {
    r = await tfAsync(['init', '-input=false', ...extra], { cwd, docker: true, ...opts });
    if (r.code === 0) break;
    await new Promise((ok) => setTimeout(ok, 4000 * (i + 1)));
  }
  return { code: r.code, out: clean(r.out) };
}

/** The last n non-empty lines of a text. */
export const tail = (text, n = 8) => clean(text).split('\n').filter((l) => l.trim()).slice(-n).join('\n');

/** The first n non-empty lines. */
export const head = (text, n = 12) => clean(text).split('\n').filter((l) => l.trim()).slice(0, n).join('\n');

/** The lines of a text that match a pattern. */
export const grep = (text, re) => clean(text).split('\n').filter((l) => re.test(l)).join('\n');

/** The "Error: ..." block of a Terraform output: from the first Error line to the end, without box characters. */
export function errorBlock(text, maxLines = 14) {
  const lines = clean(text).split('\n').map((l) => l.replace(/^[│╷╵]\s?/, '').trimEnd());
  const i = lines.findIndex((l) => l.startsWith('Error:'));
  if (i < 0) return '';
  return lines.slice(i).filter((l) => l.trim() !== '').slice(0, maxLines).join('\n');
}

/** Names of the containers labelled with this challenge (all of them, running or not), sorted. */
export function containers() {
  const r = run(['ps', '-a', '--filter', `label=tfc.challenge=${N}`, '--format', '{{.Names}}']);
  return r.stdout.split('\n').map((s) => s.trim()).filter(Boolean).sort();
}

/** The environment variables of one container, as a list like ["GREETING=hello"]. */
export function containerEnv(name) {
  const r = run(['inspect', '--format', '{{json .Config.Env}}', name]);
  if (r.code !== 0) return null;
  return JSON.parse(r.stdout).filter((e) => e.startsWith('GREETING='));
}

/** Every file below a folder (relative paths, sorted), skipping .terraform. */
export function listFiles(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === '.terraform') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listFiles(p, base));
    else out.push(p.slice(base.length + 1).replaceAll('\\', '/'));
  }
  return out.sort();
}

export const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');

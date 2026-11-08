// Run Terraform or OpenTofu the same way on every machine. Plain Node, no npm packages.
//
// Two modes:
//   docker  runs the pinned official image (hashicorp/terraform or ghcr.io/opentofu/opentofu)
//           with your folder mounted. Same versions everywhere. This is what the reference run used.
//   local   runs the terraform or tofu program on your PATH.
// Pick one with TFC_MODE=docker or TFC_MODE=local. Without it, local is used when the program on your
// PATH is new enough (Terraform 1.17 or OpenTofu 1.13), and docker otherwise.
// Pick the tool with TFC_TOOL=terraform (default) or TFC_TOOL=tofu.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export const PIN = {
  terraform: { version: '1.17.1', image: 'hashicorp/terraform:1.17.1', min: [1, 17] },
  tofu: { version: '1.13.9', image: 'ghcr.io/opentofu/opentofu:1.13.9', min: [1, 13] },
};

export const toolName = () => (process.env.TFC_TOOL === 'tofu' ? 'tofu' : 'terraform');

const TEXT_FILE_BUSY = /text file busy/;
const COLOR_OFF = ['workspace_new', 'workspace_select', 'workspace_delete', 'init', 'plan', 'apply', 'destroy', 'validate', 'import', 'test', 'refresh', 'show', 'output', 'fmt'];

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd,
    env: { ...process.env, ...(opts.env || {}) },
    encoding: 'utf8',
    input: opts.input,
    timeout: opts.timeoutMs ?? 600_000,
    maxBuffer: 128 * 1024 * 1024,
    windowsHide: true,
  });
  if (r.error) return { code: r.error.code === 'ETIMEDOUT' ? 124 : 127, stdout: r.stdout ?? '', stderr: `${r.stderr ?? ''}${r.error.message}` };
  return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

let cachedMode;
/** 'docker' or 'local'. */
export function mode() {
  if (process.env.TFC_MODE === 'docker' || process.env.TFC_MODE === 'local') return process.env.TFC_MODE;
  if (cachedMode) return cachedMode;
  const tool = toolName();
  const v = sh(tool, ['version', '-json']);
  let ok = false;
  if (v.code === 0) {
    try {
      const j = JSON.parse(v.stdout);
      const ver = String(j.terraform_version || j.version || '').split('.').map(Number);
      const [maj, min] = PIN[tool].min;
      ok = ver[0] > maj || (ver[0] === maj && ver[1] >= min);
    } catch { /* not json: treat as too old */ }
  }
  cachedMode = ok ? 'local' : 'docker';
  return cachedMode;
}

function dockerArgs(cwd, args, opts) {
  const tool = toolName();
  const cache = join(root, '.cache', 'plugins');
  mkdirSync(cache, { recursive: true });
  const a = ['run', '--rm', '-i', '-v', `${resolve(cwd)}:/work`, '-w', '/work', '-v', `${cache}:/plugin-cache`,
    '-e', 'TF_PLUGIN_CACHE_DIR=/plugin-cache', '-e', 'TF_IN_AUTOMATION=1', '-e', 'TF_INPUT=0', '-e', 'HOME=/tmp', '--add-host', 'host.docker.internal:host-gateway'];
  if (platform() === 'linux' && process.getuid) a.push('--user', `${process.getuid()}:${process.getgid()}`);
  if (opts.docker) {
    a.push('-v', '/var/run/docker.sock:/var/run/docker.sock');
    if (platform() === 'linux' && existsSync('/var/run/docker.sock')) {
      const gid = sh('stat', ['-c', '%g', '/var/run/docker.sock']).stdout.trim();
      if (gid) a.push('--group-add', gid);
    }
  }
  for (const k of Object.keys(opts.env || {})) a.push('-e', `${k}=${opts.env[k]}`);
  for (const k of COLOR_OFF) a.push('-e', `TF_CLI_ARGS_${k}=-no-color`);
  a.push(PIN[tool].image, ...args);
  return a;
}

/**
 * Run terraform (or tofu) with args in folder cwd. Returns { code, stdout, stderr, out }.
 * Pass { docker: true } when the folder uses the Docker provider (docker mode then mounts the Docker socket,
 * the one named exception to "no Docker socket mount"). Pass { env: { TF_VAR_x: '1' } } for variables.
 * Colour is always off. Never throws.
 */
export function tf(args, opts = {}) {
  const cwd = resolve(opts.cwd || '.');
  let r;
  for (let attempt = 1; ; attempt++) {
    if (mode() === 'docker') {
      r = sh('docker', dockerArgs(cwd, args, opts), { ...opts, cwd: undefined, env: {} });
    } else {
      const env = { TF_IN_AUTOMATION: '1', TF_INPUT: '0', ...(opts.env || {}) };
      for (const k of COLOR_OFF) env[`TF_CLI_ARGS_${k}`] = '-no-color';
      r = sh(toolName(), args, { ...opts, cwd, env });
    }
    // Docker Desktop file sharing, or a second run on the shared plugin cache, can still hold a provider binary
    // open: "text file busy". It passes in seconds, so wait and run the same command again (3 tries in all).
    if (r.code === 0 || attempt >= 3 || !TEXT_FILE_BUSY.test(`${r.stdout}${r.stderr}`)) break;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 4000);
  }
  return { ...r, out: `${r.stdout}${r.stderr}`.replace(/\r\n/g, '\n') };
}

/**
 * Same as tf(), but returns a promise and does not block the Node event loop. Use it whenever a state
 * server (toolkit/state-server.mjs) runs inside the same Node process, or when you start two runs at once.
 * Pass { onData: (text) => ... } to see output as it arrives.
 */
export function tfAsync(args, opts = {}) {
  const cwd = resolve(opts.cwd || '.');
  const docker = mode() === 'docker';
  let cmd;
  let cargs;
  let env;
  if (docker) {
    cmd = 'docker';
    cargs = dockerArgs(cwd, args, opts);
    env = process.env;
  } else {
    cmd = toolName();
    cargs = args;
    env = { ...process.env, TF_IN_AUTOMATION: '1', TF_INPUT: '0', ...(opts.env || {}) };
    for (const k of COLOR_OFF) env[`TF_CLI_ARGS_${k}`] = '-no-color';
  }
  return new Promise((done) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (code, extra = '') => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      done({ code, stdout, stderr: stderr + extra, out: `${stdout}${stderr}${extra}`.replace(/\r\n/g, '\n') });
    };
    const child = spawn(cmd, cargs, { cwd: docker ? undefined : cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const timer = setTimeout(() => { child.kill(); finish(124, 'timed out'); }, opts.timeoutMs ?? 600_000);
    child.stdout.setEncoding('utf8').on('data', (d) => { stdout += d; opts.onData?.(d); });
    child.stderr.setEncoding('utf8').on('data', (d) => { stderr += d; opts.onData?.(d); });
    child.on('error', (e) => finish(127, e.message));
    child.on('close', (code) => finish(code ?? 1));
    child.stdin.on('error', () => {});
    child.stdin.end(opts.input ?? '');
  });
}

/** Run and parse JSON output (for `output -json`, `show -json`, `version -json`). Throws on failure. */
export function tfJson(args, opts = {}) {
  const r = tf(args, opts);
  if (r.code !== 0) throw new Error(`${toolName()} ${args.join(' ')} failed:\n${r.out}`);
  return JSON.parse(r.stdout);
}

/** The "Plan: 3 to add, 0 to change, 0 to destroy." counts, or null if there is no such line. */
export function planCounts(text) {
  const m = /Plan: (\d+) to add, (\d+) to change, (\d+) to destroy/.exec(text);
  return m ? { add: +m[1], change: +m[2], destroy: +m[3] } : null;
}

/** The "Apply complete! Resources: 3 added, 0 changed, 0 destroyed." counts, or null. */
export function applyCounts(text) {
  const m = /Apply complete! Resources: (\d+) added, (\d+) changed, (\d+) destroyed/.exec(text);
  return m ? { added: +m[1], changed: +m[2], destroyed: +m[3] } : null;
}

/** Read terraform.tfstate in a folder as an object, or null if there is none. */
export function readLocalState(cwd) {
  const p = join(resolve(cwd), 'terraform.tfstate');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}

/** The version line the tool prints, for example "Terraform v1.17.1". */
export function versionLine() {
  return tf(['version']).stdout.split('\n')[0].trim();
}

/** The host name a Terraform process uses to reach a server on this machine: the host in docker mode, loopback in local mode. */
export function hostName() {
  return mode() === 'docker' ? 'host.docker.internal' : '127.0.0.1';
}

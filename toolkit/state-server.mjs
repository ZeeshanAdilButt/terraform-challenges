// A tiny state server for the Terraform "http" backend, with locking. No npm packages.
// Run it by hand:   node toolkit/state-server.mjs --port 8787
// Or from a script: const s = await startStateServer({ port: 8787 }); ... await s.close();
//
// What it speaks (the http backend protocol):
//   GET    /state/<name>            returns the saved state, or 404 when there is none
//   POST   /state/<name>            saves a state (the lock id arrives as ?ID=<id>)
//   DELETE /state/<name>            deletes the state
//   LOCK   /lock/<name>             takes the lock; 423 and the current lock when it is already held
//   UNLOCK /lock/<name>             releases it (body is the lock info, or empty for a force unlock)
// IMPORTANT: if the server runs in the same Node process as your script, run Terraform with tfAsync() from
// toolkit/tf.js, never tf(): tf() blocks the process, so the server cannot answer and the run hangs.
// Tokens: pass { tokens: { 'dev': 'secret1', 'prod': 'secret2' } } and a request is allowed only with
// basic auth user "tf" and the password of a token whose name is the first path part of <name>
// (state name "dev/app" needs the token named "dev"). With no tokens, anything is allowed.
//
// This is a teaching server. It keeps files in a folder you choose and has no encryption.

import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function startStateServer({ port = 8787, dir = '.state', tokens = null, log = () => {} } = {}) {
  const root = resolve(dir);
  mkdirSync(root, { recursive: true });
  const locks = new Map();
  const events = [];

  const file = (name) => join(root, `${name.replace(/[^a-zA-Z0-9_\-/]/g, '_')}.json`);

  function allowed(req, name) {
    if (!tokens) return true;
    const h = req.headers.authorization || '';
    if (!h.startsWith('Basic ')) return false;
    const [user, pass] = Buffer.from(h.slice(6), 'base64').toString().split(':');
    const env = name.split('/')[0];
    return user === 'tf' && tokens[env] !== undefined && tokens[env] === pass;
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const m = /^\/(state|lock)\/(.+)$/.exec(url.pathname);
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString();
      const send = (code, text = '', type = 'application/json') => {
        events.push({ method: req.method, path: url.pathname, code });
        log(`${req.method} ${url.pathname} -> ${code}`);
        res.writeHead(code, { 'content-type': type });
        res.end(text);
      };
      if (!m) return send(404, 'not found', 'text/plain');
      const [, kind, name] = m;
      if (!allowed(req, name)) return send(401, 'unauthorized', 'text/plain');
      if (kind === 'lock') {
        if (req.method === 'LOCK') {
          if (locks.has(name)) return send(423, locks.get(name));
          locks.set(name, body);
          return send(200, body);
        }
        if (req.method === 'UNLOCK') {
          locks.delete(name);
          return send(200, '');
        }
        return send(405, 'method not allowed', 'text/plain');
      }
      const f = file(name);
      if (req.method === 'GET') return existsSync(f) ? send(200, readFileSync(f, 'utf8')) : send(404, '', 'text/plain');
      if (req.method === 'POST' || req.method === 'PUT') {
        mkdirSync(dirname(f), { recursive: true });
        writeFileSync(f, body);
        return send(200, '');
      }
      if (req.method === 'DELETE') {
        rmSync(f, { force: true });
        return send(200, '');
      }
      return send(405, 'method not allowed', 'text/plain');
    });
  });

  await new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(port, '0.0.0.0', ok);
  });
  return {
    port: server.address().port,
    dir: root,
    events,
    isLocked: (name) => locks.has(name),
    lockInfo: (name) => locks.get(name),
    forceUnlock: (name) => locks.delete(name),
    close: () => new Promise((ok) => { server.closeAllConnections?.(); server.close(ok); }),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
  const s = await startStateServer({ port: Number(arg('--port', 8787)), dir: arg('--dir', '.state'), log: (l) => console.log(l) });
  console.log(`State server on port ${s.port}, files in ${s.dir}. Press Ctrl+C to stop.`);
}

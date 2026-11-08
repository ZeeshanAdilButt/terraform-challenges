// The shape of a finished capstone, as a list of checks. Plain Node, no packages, no Docker.
//
// Each check reads files and answers pass or fail. A failing check says what to change.
// The part tests use the checks that belong to their part. capstone.test.mjs (which CI runs on every push) uses all of them.
// Nothing here judges how well you wrote something: it looks for the pieces a reviewer needs to find, such as headings,
// the real error lines, a link, a pinned commit.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const rd = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');

/** HCL without comments, so a TODO that mentions "validation" or "prevent_destroy" does not count as the real thing. */
export function code(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(#|\/\/)/.test(l))
    .map((l) => l.replace(/\s+#.*$/, ''))
    .join('\n');
}

/** The body of every block `kind "label" { ... }`, as { label, body }. */
export function blocks(text, kind) {
  const out = [];
  const re = new RegExp(`(^|\\n)\\s*${kind}\\s+"([^"]+)"(?:\\s+"([^"]+)")?\\s*\\{`, 'g');
  let m;
  while ((m = re.exec(text))) {
    let i = re.lastIndex;
    let depth = 1;
    while (i < text.length && depth > 0) {
      if (text[i] === '{') depth += 1;
      else if (text[i] === '}') depth -= 1;
      i += 1;
    }
    out.push({ label: m[3] ? `${m[2]}.${m[3]}` : m[2], body: text.slice(re.lastIndex, i - 1) });
  }
  return out;
}

function files(dir, ext, out = []) {
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir)) {
    if (n === '.terraform') continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) files(p, ext, out);
    else if (!ext || p.endsWith(ext)) out.push(p);
  }
  return out;
}

const make = (area, id, ok, pass, fail) => ({ area, id, ok: !!ok, message: ok ? pass : fail });

/** Rubric 1: the module interface. */
export function moduleChecks(root) {
  const dir = join(root, 'capstone', 'modules', 'service');
  const c = [];
  const need = ['main.tf', 'variables.tf', 'outputs.tf', 'versions.tf'];
  const missing = need.filter((f) => !existsSync(join(dir, f)));
  c.push(make('module', 'module-files', missing.length === 0, 'the module has main.tf, variables.tf, outputs.tf and versions.tf', `capstone/modules/service is missing: ${missing.join(', ')}`));

  const vars = code(rd(join(dir, 'variables.tf')));
  const vblocks = blocks(vars, 'variable');
  const mustCheck = ['name', 'environment', 'web_port', 'memory_mb', 'web_image', 'cache_image'];
  const noRule = mustCheck.filter((n) => !/validation\s*\{/.test(vblocks.find((b) => b.label === n)?.body ?? ''));
  c.push(make('module', 'variable-validation', noRule.length === 0, 'name, environment, web_port, memory_mb, web_image and cache_image each have a validation rule', `These variables have no validation block in capstone/modules/service/variables.tf: ${noRule.join(', ')}. A caller can pass anything to them.`));
  const noDesc = vblocks.filter((b) => !/description\s*=/.test(b.body)).map((b) => b.label);
  c.push(make('module', 'variable-descriptions', vblocks.length >= 6 && noDesc.length === 0, `${vblocks.length} variables, all with a description`, noDesc.length ? `These variables have no description: ${noDesc.join(', ')}` : 'The module needs at least 6 variables (name, environment, web_port, memory_mb, web_image, cache_image, data_volume, protected).'));
  const noMessage = vblocks.filter((b) => /validation\s*\{/.test(b.body) && !/error_message\s*=/.test(b.body)).map((b) => b.label);
  c.push(make('module', 'error-messages', noMessage.length === 0, 'every validation rule has an error_message', `Add an error_message to the validation of: ${noMessage.join(', ')}`));

  const ver = code(rd(join(dir, 'versions.tf')));
  c.push(make('module', 'provider-pinned', /kreuzwerker\/docker/.test(ver) && /version\s*=\s*"~>\s*4\.\d+/.test(ver) && /required_version\s*=/.test(ver), 'versions.tf pins Terraform (required_version) and the Docker provider (~> 4.x)', 'capstone/modules/service/versions.tf must set required_version and version = "~> 4.6" for kreuzwerker/docker.'));

  const outs = blocks(code(rd(join(dir, 'outputs.tf'))), 'output');
  const wanted = ['web_url', 'web_container', 'cache_container', 'cache_address', 'network_name'];
  const lacking = wanted.filter((n) => !outs.some((o) => o.label === n));
  c.push(make('module', 'outputs', lacking.length === 0, 'the module has the five outputs of its interface', `capstone/modules/service/outputs.tf is missing: ${lacking.join(', ')}`));
  const leaks = outs.filter((o) => /value\s*=\s*(docker_[a-z_]+\.[a-z_]+|module\.[a-z_]+)\s*$/m.test(o.body)).map((o) => o.label);
  c.push(make('module', 'outputs-are-values', outs.length > 0 && leaks.length === 0, 'no output hands back a whole resource', (outs.length === 0 ? 'There are no outputs yet: write them first.' : `These outputs return a whole resource, which carries environment variables and every other attribute: ${leaks.join(', ')}. Return one value.`)));
  c.push(make('module', 'outputs-described', outs.length > 0 && outs.every((o) => /description\s*=/.test(o.body)), 'every output has a description', 'Give every output a description.'));

  const main = code(rd(join(dir, 'main.tf')));
  const res = blocks(main, 'resource').map((b) => b.label);
  const lackingRes = ['docker_container.web', 'docker_container.cache', 'docker_network.this', 'docker_image.web', 'docker_image.cache'].filter((r) => !res.includes(r));
  c.push(make('module', 'module-resources', lackingRes.length === 0, 'the module builds two images, a network and two containers', `capstone/modules/service/main.tf has no resource ${lackingRes.join(', ')}.`));
  const cache = blocks(main, 'resource').find((b) => b.label === 'docker_container.cache')?.body ?? '';
  const web = blocks(main, 'resource').find((b) => b.label === 'docker_container.web')?.body ?? '';
  c.push(make('module', 'cache-protected-label', /tfc\.protected/.test(cache) && /tfc\.challenge/.test(cache) && /volume_name\s*=\s*var\.data_volume/.test(cache), 'the cache container carries tfc.challenge and tfc.protected and mounts the data volume', 'The cache container needs the labels tfc.challenge and tfc.protected, and a volumes block with volume_name = var.data_volume.'));
  c.push(make('module', 'web-loopback', /ip\s*=\s*"127\.0\.0\.1"/.test(web) && /external\s*=\s*var\.web_port/.test(web), 'the web container is published on 127.0.0.1 at var.web_port', 'The web container needs a ports block with external = var.web_port and ip = "127.0.0.1" (this machine only).'));
  const hidden = /\bdata\s+"|provisioner\s+"|local-exec|\bfile\(|\bpathexpand\(/.test(main);
  c.push(make('module', 'no-hidden-inputs', !hidden, 'the module reads nothing from outside: no data sources, files or provisioners', 'The module must not use data sources, file(), or provisioners. Everything it needs comes in through a variable.'));
  return c;
}

/** Rubric 2: state and environments. */
export function envChecks(root) {
  const cap = join(root, 'capstone');
  const c = [];
  const env = (e) => code(rd(join(cap, 'envs', e, 'main.tf')));
  for (const e of ['dev', 'prod']) {
    const t = env(e);
    c.push(make('envs', `${e}-calls-module`, /module\s+"service"/.test(t) && /source\s*=\s*"\.\.\/\.\.\/modules\/service"/.test(t) && /\bweb_port\s*=/.test(t) && /\bdata_volume\s*=\s*docker_volume\./.test(t), `${e} calls the module with its port and its own data volume`, `capstone/envs/${e}/main.tf must call module "service" from ../../modules/service and pass web_port and data_volume = docker_volume.cache_data.name.`));
    c.push(make('envs', `${e}-backend`, /backend\s+"http"/.test(t), `${e} keeps its state in the http backend`, `capstone/envs/${e}/main.tf needs backend "http" {}.`));
    c.push(make('envs', `${e}-outputs`, /output\s+"web_url"/.test(t) && /output\s+"cache_address"/.test(t), `${e} hands back web_url and cache_address`, `capstone/envs/${e}/main.tf must output web_url and cache_address (taken from the module).`));
  }
  const bd = rd(join(cap, 'envs', 'dev', 'backend.hcl'));
  const bp = rd(join(cap, 'envs', 'prod', 'backend.hcl'));
  const nameOf = (b) => /address\s*=\s*"[^"]*\/state\/([^"]+)"/.exec(b)?.[1] ?? '';
  c.push(make('envs', 'one-state-per-environment', nameOf(bd).startsWith('dev/') && nameOf(bp).startsWith('prod/') && nameOf(bd) !== nameOf(bp), `dev keeps its state as ${nameOf(bd)}, prod as ${nameOf(bp)}`, 'capstone/envs/dev/backend.hcl and capstone/envs/prod/backend.hcl must name different states: /state/dev/<name> and /state/prod/<name>.'));
  const locks = ['dev', 'prod'].every((e) => /lock_address\s*=/.test(rd(join(cap, 'envs', e, 'backend.hcl'))) && /unlock_address\s*=/.test(rd(join(cap, 'envs', e, 'backend.hcl'))));
  c.push(make('envs', 'backend-locks', locks, 'both backends set lock_address and unlock_address', 'Without lock_address and unlock_address the http backend never locks the state. Set both in each backend.hcl.'));
  c.push(make('envs', 'prod-prevent-destroy', /prevent_destroy\s*=\s*true/.test(env('prod')), 'prod guards its data volume with prevent_destroy', 'capstone/envs/prod/main.tf: add lifecycle { prevent_destroy = true } to docker_volume.cache_data.'));
  c.push(make('envs', 'dev-no-prevent-destroy', !/prevent_destroy/.test(env('dev')), 'dev has no prevent_destroy (it is meant to be thrown away)', 'capstone/envs/dev/main.tf must not have prevent_destroy: dev is the environment you destroy and rebuild.'));
  c.push(make('envs', 'prod-protected', /protected\s*=\s*true/.test(env('prod')) && /protected\s*=\s*false/.test(env('dev')) && /tfc\.protected/.test(env('prod')), 'prod marks its cache and volume protected, dev does not', 'prod must pass protected = true to the module and label its volume tfc.protected = "true"; dev uses false.'));
  const all = files(cap).filter((f) => !f.endsWith('.lock.hcl') && /\.(tf|hcl|md|mjs|yml|json)$/.test(f));
  const withSecret = all.filter((f) => /password\s*=\s*"[^"]+"|ghp_[A-Za-z0-9]{20}|AKIA[0-9A-Z]{16}/.test(rd(f))).map((f) => f.slice(root.length + 1).replaceAll('\\', '/'));
  c.push(make('envs', 'no-secrets-committed', withSecret.length === 0, 'no password or token is written in any capstone file', `A password or token is written in: ${withSecret.join(', ')}. Pass it through TF_HTTP_PASSWORD instead.`));
  const state = files(cap).filter((f) => /terraform\.tfstate|\.tfstate\.backup$/.test(f)).map((f) => f.slice(root.length + 1).replaceAll('\\', '/'));
  c.push(make('envs', 'no-state-committed', state.length === 0, 'no state file is inside capstone/', `State files are inside capstone/: ${state.join(', ')}. A state file can hold secrets. Delete it; the state belongs on the state server.`));
  const lockFiles = ['', 'envs/dev', 'envs/prod'].filter((d) => !existsSync(join(cap, d, '.terraform.lock.hcl')));
  c.push(make('envs', 'lock-files', lockFiles.length === 0, 'capstone/, envs/dev and envs/prod each commit .terraform.lock.hcl', `Missing .terraform.lock.hcl in: ${lockFiles.map((d) => `capstone/${d}`.replace(/\/$/, '')).join(', ')}. Run terraform init there and commit the file.`));
  return c;
}

/** Rubric 3 (the tests half). */
export function testChecks(root) {
  const dir = join(root, 'capstone', 'tests');
  const tf = files(dir, '.tftest.hcl');
  const txt = tf.map((f) => code(rd(f)));
  const all = txt.join('\n');
  const count = (re) => (all.match(re) || []).length;
  const c = [];
  c.push(make('tests', 'tests-exist', tf.length >= 3, `${tf.length} test files in capstone/tests`, 'capstone/tests needs at least three .tftest.hcl files: a plan test, a failing-validation test and a mock test.'));
  c.push(make('tests', 'plan-tests', count(/command\s*=\s*plan/g) >= 2, `${count(/command\s*=\s*plan/g)} run blocks use command = plan`, 'Write at least two run blocks with command = plan (plan.tftest.hcl).'));
  c.push(make('tests', 'failure-tests', count(/expect_failures\s*=/g) >= 3, `${count(/expect_failures\s*=/g)} run blocks use expect_failures`, 'Write at least three run blocks with expect_failures (validation.tftest.hcl): one for each rule a caller could break.'));
  const mockApplies = txt.filter((t) => /mock_provider\s+"docker"/.test(t)).map((t) => (t.match(/command\s*=\s*apply/g) || []).length).reduce((a, b) => a + b, 0);
  c.push(make('tests', 'mock-tests', mockApplies >= 2, `${mockApplies} run blocks apply against a mocked provider`, 'Write at least two run blocks with command = apply in a file that has mock_provider "docker" {} (mock.tftest.hcl).'));
  c.push(make('tests', 'tests-mock-docker', txt.length > 0 && txt.every((t) => /mock_provider\s+"docker"/.test(t)), 'every test file mocks the docker provider, so CI needs no Docker engine', 'Every .tftest.hcl needs mock_provider "docker" {}, so the tests run without a Docker engine.'));
  c.push(make('tests', 'asserts', count(/\bassert\s*\{/g) >= 6, `${count(/\bassert\s*\{/g)} assert blocks`, 'The plan and mock tests need at least six assert blocks between them.'));
  return c;
}

const label = (value) => [{ label: 'tfc.challenge', value: '14' }, { label: 'tfc.protected', value }];
const rc = (address, type, actions, before, after = before) => ({ address, type, change: { actions, before: before ? { labels: before } : null, after: after ? { labels: after } : null } });
const planOf = (...resource_changes) => ({ format_version: '1.2', resource_changes });

/** Rubric 3 (the gate half): the gate script, run on small made-up plans. */
export function gateChecks(root) {
  const file = join(root, 'capstone', 'gate', 'plan-gate.mjs');
  if (!existsSync(file)) return [make('gate', 'gate-exists', false, '', 'capstone/gate/plan-gate.mjs does not exist.')];
  const run = (input) => {
    const r = spawnSync(process.execPath, [file], { input: JSON.stringify(input), encoding: 'utf8', timeout: 20_000 });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  };
  const c = [make('gate', 'gate-exists', true, 'capstone/gate/plan-gate.mjs exists', '')];
  const expect = (id, input, want, pass, fail) => {
    const r = run(input);
    c.push(make('gate', id, r.code === want, pass, `${fail} (the gate exited ${r.code}, it should exit ${want})`));
    return r;
  };
  const del = expect('gate-blocks-destroy', planOf(rc('module.service.docker_container.cache', 'docker_container', ['delete'], label('true'), null)), 1, 'a destroy of a protected resource exits 1', 'A plan that destroys a resource labelled tfc.protected = true must exit 1');
  c.push(make('gate', 'gate-names-the-resource', /BLOCKED/.test(del.out) && /docker_container\.cache/.test(del.out), 'the gate prints BLOCKED and the address of the resource', 'When it blocks, the gate must print a line with BLOCKED and the address of the resource.'));
  expect('gate-blocks-replace', planOf(rc('docker_volume.cache_data', 'docker_volume', ['delete', 'create'], label('true'))), 1, 'a replacement of a protected resource exits 1', 'A replacement (actions delete and create) of a protected resource must exit 1');
  expect('gate-blocks-create-before-destroy', planOf(rc('module.service.docker_container.cache', 'docker_container', ['create', 'delete'], label('true'))), 1, 'create-before-destroy replacement exits 1', 'A replacement with the actions create then delete must exit 1 as well');
  expect('gate-allows-unprotected', planOf(rc('module.service.docker_container.web', 'docker_container', ['delete', 'create'], [{ label: 'tfc.challenge', value: '14' }])), 0, 'replacing an unprotected resource passes', 'Replacing a resource that is not protected must exit 0');
  expect('gate-allows-update', planOf(rc('module.service.docker_container.cache', 'docker_container', ['update'], label('true'))), 0, 'updating a protected resource passes', 'An in-place update of a protected resource must exit 0');
  expect('gate-allows-create', planOf(rc('module.service.docker_container.cache', 'docker_container', ['create'], null, label('true'))), 0, 'creating a protected resource passes', 'Creating a protected resource (before is null) must exit 0');
  expect('gate-reads-before', planOf(rc('module.service.docker_container.cache', 'docker_container', ['delete', 'create'], label('true'), label('false'))), 1, 'the label is read from the existing resource, not the new one', 'A plan that removes the label and replaces the resource in one step must still exit 1: read the label from before');
  expect('gate-refuses-errored', { errored: true, resource_changes: [] }, 1, 'an errored plan is refused', 'A plan with "errored": true cannot be applied, so the gate must exit 1');
  expect('gate-not-a-plan', { nothing: true }, 2, 'input that is not a plan exits 2', 'Input without resource_changes is not a plan: exit 2');
  return c;
}

const USES = /^\s*-?\s*uses:\s*(\S+)(?:\s+#\s*(.*))?$/;

/** The `uses:` lines of a workflow: { action, ref, comment }. Local actions (./...) are left out. */
export function usesOf(text) {
  return text.split('\n').map((l) => USES.exec(l)).filter(Boolean).map((m) => ({ action: m[1].split('@')[0], ref: m[1].split('@')[1] ?? '', comment: (m[2] || '').trim() })).filter((u) => !u.action.startsWith('./'));
}

/** Rubric 4: the pipeline, read from .github/workflows/terraform.yml. */
export function workflowChecks(root) {
  const file = join(root, '.github', 'workflows', 'terraform.yml');
  const t = rd(file);
  const body = t.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  const c = [make('workflow', 'workflow-exists', t.length > 0, '.github/workflows/terraform.yml exists', '.github/workflows/terraform.yml does not exist.')];
  const uses = usesOf(body);
  const loose = uses.filter((u) => !/^[0-9a-f]{40}$/.test(u.ref)).map((u) => `${u.action}@${u.ref || '(no ref)'}`);
  c.push(make('workflow', 'uses-pinned', uses.length >= 5 && loose.length === 0, `${uses.length} actions, every one pinned to a full commit SHA`, loose.length ? `These actions are not pinned to 40 hexadecimal characters: ${loose.join(', ')}. Look each one up: gh api repos/<owner>/<repo>/commits/<tag> -q .sha` : 'The workflow should use checkout, setup-node, setup-terraform, upload-artifact and download-artifact (5 actions).'));
  const unnamed = uses.filter((u) => !/^v?\d+(\.\d+)*/.test(u.comment)).map((u) => u.action);
  c.push(make('workflow', 'uses-have-tag-comment', uses.length > 0 && unnamed.length === 0, 'every pin says which tag it is in a comment', `Write the tag after each SHA as a comment (# v4.0.1), so a person can read the version. Missing for: ${unnamed.join(', ')}`));
  c.push(make('workflow', 'triggers', /pull_request:/.test(body) && /push:/.test(body) && /branches:\s*\[\s*main\s*\]|-\s*main\b/.test(body) && !/pull_request_target/.test(body), 'plan on pull request, apply on push to main (not pull_request_target)', 'The workflow must run on pull_request and on push to main. Never use pull_request_target: it gives code from a fork a token with write access.'));
  c.push(make('workflow', 'permissions', /^permissions:\s*\n\s+contents:\s*read/m.test(body) && !/write-all/.test(body), 'workflow permissions start at contents: read', 'Set permissions: contents: read at the top of the workflow.'));
  c.push(make('workflow', 'concurrency-per-environment', /concurrency:\s*\n\s+group:\s*[^\n]*(matrix\.env|\$\{\{\s*matrix\.environment)/.test(body) && (body.match(/concurrency:/g) || []).length >= 2 && /cancel-in-progress:\s*false/.test(body), 'one concurrency group per environment, and a running apply is never cancelled', 'Give the plan job and the apply job a concurrency: group that contains the environment (terraform-${{ matrix.env }}) and cancel-in-progress: false.'));
  c.push(make('workflow', 'plan-on-pr', /pipeline\.mjs\s+plan|terraform\s+plan[^\n]*-out/.test(body) && /upload-artifact/.test(body), 'the plan job saves the plan as an artifact', 'The plan job must run the plan step (pipeline.mjs plan <env>) and upload the saved plan with actions/upload-artifact.'));
  const applyStep = /pipeline\.mjs\s+apply|terraform\s+apply/.test(body);
  c.push(make('workflow', 'apply-saved-plan', applyStep && /download-artifact/.test(body) && /github\.event_name\s*==\s*'push'/.test(body) && !/-auto-approve/.test(body), 'apply downloads the saved plan and runs only on push', 'The apply job must run on push only (if: github.event_name == \'push\'), download the plan artifact and apply that file. Do not use -auto-approve: it plans again.'));
  c.push(make('workflow', 'credentials-per-environment', /environment:\s*\$\{\{\s*matrix\.env\s*\}\}/.test(body) && /TF_HTTP_PASSWORD:\s*\$\{\{\s*secrets\.\w+\s*\}\}/.test(body), 'each environment has its own secret (environment: and TF_HTTP_PASSWORD from secrets)', 'Set environment: ${{ matrix.env }} on the jobs and TF_HTTP_PASSWORD: ${{ secrets.STATE_TOKEN }}, so dev and prod each read their own secret.'));
  c.push(make('workflow', 'no-secret-echo', !/echo[^\n]*\$\{\{\s*secrets|set -x|ACTIONS_STEP_DEBUG/.test(body), 'no step prints a secret or turns on shell tracing', 'No step may echo a secret or use set -x: the log would show it.'));
  return c;
}

const section = (text, title) => {
  const re = new RegExp(`^##\\s+${title}\\s*$`, 'mi');
  const m = re.exec(text);
  if (!m) return null;
  const rest = text.slice(m.index + m[0].length);
  const next = /^##\s+(?!#)/m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
};
const sub = (sec, title) => {
  const m = new RegExp(`^###\\s+${title}\\s*$`, 'mi').exec(sec);
  if (!m) return null;
  const rest = sec.slice(m.index + m[0].length);
  const next = /^###\s+/m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
};
const fences = (s) => [...(s || '').matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1]);

/** What a real error looks like for each failure. These are lines Terraform and Docker print; the part 3 run records them. */
export const REAL_ERRORS = {
  'Stuck lock': { error: /Error acquiring the state lock/, errorExtra: /^\s*ID:/m, errorExtraWhy: 'the Lock Info block with its ID: line', cmd: /terraform (plan|apply)/, fix: /force-unlock/ },
  'Lost state': { error: /already exists|already in use by container|No state file was found|Plan: \d+ to add, 0 to change, 0 to destroy/, cmd: /state pull/, fix: /state push/ },
  'Failed apply': { error: /port is already allocated|Unable to start container/, cmd: /terraform (apply|plan)|docker ps/, fix: /terraform apply|apply -replace/ },
};

/** Rubric 5: the runbook. */
export function runbookChecks(root) {
  const t = rd(join(root, 'capstone', 'RUNBOOK.md'));
  const c = [make('runbook', 'runbook-exists', t.length > 0, 'capstone/RUNBOOK.md exists', 'capstone/RUNBOOK.md does not exist.')];
  c.push(make('runbook', 'runbook-no-todo', t.length > 0 && !/TODO/.test(t), 'no TODO is left in the runbook', 'RUNBOOK.md still has TODO lines. Replace each with what you saw and did.'));
  for (const [title, rule] of Object.entries(REAL_ERRORS)) {
    const sec = section(t, title);
    const cmd = sub(sec || '', 'Command');
    const err = sub(sec || '', 'Error');
    const fix = sub(sec || '', 'Recovery');
    const id = title.toLowerCase().replace(/\s+/g, '-');
    const src = (re) => re.source.replaceAll('\\', '');
    c.push(make('runbook', `runbook-${id}-sections`, !!sec && cmd !== null && err !== null && fix !== null, `"${title}" has Command, Error and Recovery`, `RUNBOOK.md needs a "## ${title}" section with the three headings "### Command", "### Error" and "### Recovery".`));
    const hasError = fences(err).some((f) => rule.error.test(f));
    const hasExtra = !rule.errorExtra || fences(err).some((f) => rule.errorExtra.test(f));
    c.push(make('runbook', `runbook-${id}-error`, hasError && hasExtra, `"${title}": the Error block holds the real error text`, `"## ${title}", "### Error": paste the real error text from your run in a code block. It contains a line like: ${src(rule.error)}${hasError && !hasExtra ? `. It must also hold ${rule.errorExtraWhy}` : ''}`));
    c.push(make('runbook', `runbook-${id}-command`, fences(cmd).some((f) => rule.cmd.test(f)), `"${title}": the Command block holds the command`, `"## ${title}", "### Command": put the command (${src(rule.cmd)}) in a code block.`));
    c.push(make('runbook', `runbook-${id}-recovery`, fences(fix).some((f) => rule.fix.test(f)), `"${title}": the Recovery block holds the command that restores service`, `"## ${title}", "### Recovery": put the command that restores service (${src(rule.fix)}) in a code block.`));
  }
  return c;
}

export const QUESTIONS = [
  'Two engineers apply at the same moment. What protects the state, and what do you do when a lock is stuck?',
  'How do you test Terraform code with no cloud account?',
  'How do you split state between dev and prod, and why?',
  'Describe a safe Terraform pipeline.',
  'A provider upgrade changes your plan. What do you do?',
  'Defend your platform: what breaks, how do you know, how do you recover?',
];

/** Rubric 7: the defence document. */
export function defenceChecks(root) {
  const t = rd(join(root, 'capstone', 'DEFENCE.md'));
  const c = [make('defence', 'defence-exists', t.length > 0, 'capstone/DEFENCE.md exists', 'capstone/DEFENCE.md does not exist.')];
  c.push(make('defence', 'defence-link', /^Recording:\s+https?:\/\/\S+\s*$/m.test(t) && !/https?:\/\/\S*(TODO|example\.invalid)/.test(t), 'the Recording: line holds a link', 'DEFENCE.md needs one line that starts with "Recording: " followed by the https link to your five-minute recording.'));
  c.push(make('defence', 'defence-no-todo', t.length > 0 && !/TODO/.test(t), 'no TODO is left in the defence', 'DEFENCE.md still has TODO lines.'));
  for (const q of QUESTIONS) {
    const re = new RegExp(`^###\\s+${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm');
    const m = re.exec(t);
    let words = 0;
    if (m) {
      const rest = t.slice(m.index + m[0].length);
      const next = /^#{2,3}\s+/m.exec(rest);
      words = (next ? rest.slice(0, next.index) : rest).split(/\s+/).filter(Boolean).length;
    }
    c.push(make('defence', `defence-${QUESTIONS.indexOf(q) + 1}`, !!m && words >= 40, `answered: ${q}`, m ? `Your answer to "${q}" is ${words} words. Write at least 40, in your own words.` : `DEFENCE.md needs the heading "### ${q}" followed by your answer.`));
  }
  return c;
}

/** All checks that need no Docker, in the order of the rubric. */
export function allChecks(root) {
  return [...moduleChecks(root), ...envChecks(root), ...testChecks(root), ...gateChecks(root), ...workflowChecks(root), ...runbookChecks(root), ...defenceChecks(root)];
}

export const failing = (checks) => checks.filter((c) => !c.ok);

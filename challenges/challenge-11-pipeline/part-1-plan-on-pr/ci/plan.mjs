// The "plan on pull request" step of a pipeline.
// Run: node ci/plan.mjs <folder with the Terraform code> [--out plan.tfplan] [--md plan.md]
//
// It runs, in order: init, validate, fmt -check, plan -out, show -json. It stops at the first step that fails.
// Whatever happens it writes a Markdown file (plan.md) that the workflow posts as a comment on the pull request,
// and it exits with 0 (plan made) or 1 (a step failed).

import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** One word for what a resource change does: create, update, delete or replace. Other actions return ''. */
export function actionName(actions) {
  const a = [...actions].sort().join('+');
  if (a === 'create+delete') return 'replace';
  if (a === 'create') return 'create';
  if (a === 'update') return 'update';
  if (a === 'delete') return 'delete';
  return '';
}

/**
 * Turn the JSON from `terraform show -json <planfile>` into Markdown for a pull request comment.
 * Rules (the test checks them):
 *   1. A heading line: ## Terraform plan for `<dir>`
 *   2. A bold summary line: **Plan: A to add, C to change, D to destroy.**
 *      A replace counts once as an add and once as a destroy, like the line Terraform prints.
 *   3. A table with the header | Resource | Action | and one row per change that does something:
 *      | `docker_container.db` | replace |
 *   4. When D is more than 0, a last line that starts with: > **Warning:**
 *      and says how many resources the plan destroys.
 *   5. When nothing changes, the summary line says: **No changes.** and there is no table.
 */
export function renderMarkdown(plan, { dir = '.' } = {}) {
  // TODO: write the Markdown described above. Use actionName() for each change in plan.resource_changes.
  // Each item has an address (such as docker_container.db) and change.actions (such as ["delete", "create"]).
  return `## Terraform plan for \`${dir}\`\n\n(no summary yet)\n`;
}

// ---- the command line part: nothing below is needed by the test ----

function findToolkit() {
  let d = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const p = join(d, 'toolkit', 'tf.js');
    if (existsSync(p)) return p;
    d = dirname(d);
  }
  throw new Error('Could not find toolkit/tf.js above this script.');
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : fallback;
  };
  const dir = resolve(args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--')) || '.');
  const planFile = opt('--out', 'plan.tfplan');
  const mdFile = resolve(opt('--md', join(dir, 'plan.md')));
  const { tf } = await import(pathToFileURL(findToolkit()).href);
  const run = (a) => tf(a, { cwd: dir, docker: true });

  const steps = [
    ['init', ['init', '-input=false']],
    ['validate', ['validate']],
    ['fmt', ['fmt', '-check', '-diff', '-recursive']],
    ['plan', ['plan', '-input=false', `-out=${planFile}`]],
    ['show', ['show', '-json', planFile]],
  ];
  let json = '';
  let n = 0;
  for (const [name, a] of steps) {
    n++;
    const t0 = Date.now();
    const r = run(a);
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    if (r.code !== 0) {
      console.log(`[${n}/${steps.length}] terraform ${a.join(' ')} ... FAILED (exit ${r.code}, ${secs}s)`);
      const text = r.out.split('\n').slice(0, 30).join('\n');
      writeFileSync(mdFile, `## Terraform plan for \`${dir.split(/[\\/]/).pop()}\`\n\n**Failed at the ${name} step** (exit code ${r.code}).\n\n\`\`\`text\n${text}\n\`\`\`\n`);
      console.log(text);
      process.exit(1);
    }
    if (name === 'show') json = r.stdout;
    console.log(`[${n}/${steps.length}] terraform ${a.join(' ')} ... ok (${secs}s)`);
  }
  writeFileSync(mdFile, renderMarkdown(JSON.parse(json), { dir: dir.split(/[\\/]/).pop() }));
  console.log(`Wrote ${planFile} and ${mdFile.split(/[\\/]/).pop()}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}

// Challenge 6, part 3: sensitive values in plans.
// Run: node challenges/challenge-6-plans-and-drift/part-3-sensitive-values-in-plans/run.mjs
// Add --record to also write results.md and chart.svg next to this file.
// Add --reference (or set TFC_REFERENCE=1) to run the reference solution instead of your files.
//
// It makes a plan with a sensitive variable and a random password, applies it, and looks for the two secrets
// in every place Terraform keeps or prints them: the plan text, the plan as JSON, the plan file itself, the state
// file, `show`, `output`. Then it compares what it found with your predictions in predictions.json.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { prepareWork, recording, useReference } from '../../../toolkit/part.js';
import { cleanup } from '../../../toolkit/docker.js';
import { setFact } from '../../../toolkit/facts.js';
import { Recorder } from '../../../toolkit/record.js';
import { barsSvg } from '../../../toolkit/bars.js';
import { N, initRetry, lines, pick, tfRetry, zipEntries } from '../lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const rec = new Recorder('Challenge 6, part 3: sensitive values in plans');
const work = prepareWork(import.meta.url);
const live = join(work, 'live');
mkdirSync(live, { recursive: true });
writeFileSync(join(live, 'main.tf'), readFileSync(join(work, 'main.tf')));

const DEMO = 'demo-db-password-7731';
const env = { TF_VAR_db_password: DEMO };
const run = (args) => tfRetry(args, { cwd: live, env });

try {
  cleanup(N);
  initRetry(live);

  // Plan.
  const plan = run(['plan', '-out=plan.tfplan']);
  const planText = plan.out;
  rec.step(
    'terraform plan -out=plan.tfplan     (TF_VAR_db_password is set to a made-up demo value)',
    lines(planText).filter((l) => /^  # |input|result|bcrypt|api_token|^Plan:|saved the plan/.test(l)).join('\n'),
    'The words (sensitive value) stand where the secrets would be. This is all `sensitive` does: it hides values in what Terraform prints. random_password.result is not here at all, because it does not exist yet.',
  );
  const json = run(['show', '-json', 'plan.tfplan']);
  const p = JSON.parse(json.stdout);
  const dbChange = p.resource_changes.find((c) => c.address === 'terraform_data.db').change;
  const apiChange = p.resource_changes.find((c) => c.address === 'terraform_data.api').change;
  const found = [
    ['variables.db_password.value', p.variables?.db_password?.value],
    ['resource_changes[terraform_data.db].change.after.input', dbChange.after?.input],
    ['resource_changes[terraform_data.db].change.after_sensitive.input', dbChange.after_sensitive?.input],
    ['resource_changes[terraform_data.api].change.after.input', apiChange.after?.input],
    ['resource_changes[terraform_data.api].change.after_unknown.input', apiChange.after_unknown?.input],
  ].map(([k, v]) => `${k.padEnd(66)} ${JSON.stringify(v)}`);
  rec.step('terraform show -json plan.tfplan     (then read it with Node)', found.join('\n'), 'The JSON plan holds the variable in plain text, and a flag next to the resource that says "this one is sensitive". The flag is for the tool that reads the JSON, not protection. The random password is "unknown": not made yet.');
  const jsonShowsVar = json.stdout.includes(DEMO);

  const planEntries = zipEntries(readFileSync(join(live, 'plan.tfplan')));
  const planFileShows = planEntries.some((e) => e.data.includes(DEMO));
  const rawFileShows = readFileSync(join(live, 'plan.tfplan')).includes(DEMO);
  rec.step(
    'look inside plan.tfplan (it is a zip file): the raw bytes, then each entry after unzipping',
    [`raw bytes contain the demo password: ${rawFileShows}`, ...planEntries.map((e) => `${e.name.padEnd(22)} ${String(e.data.length).padStart(5)} bytes   contains it: ${e.data.includes(DEMO)}`)].join('\n'),
    'The saved plan file looks like binary rubbish, so it feels safe. It is a zip, and the entry called tfplan holds the value. Treat a plan file like a password.',
  );

  // Apply the saved plan.
  const ap = run(['apply', 'plan.tfplan']);
  const token = run(['output', '-raw', 'api_token']).stdout.trim();
  rec.step('terraform apply plan.tfplan', pick(ap.out, /^random_password|^terraform_data|Apply complete|^Error/), 'The random password now exists, and so does the state file.');

  const stateText = readFileSync(join(live, 'terraform.tfstate'), 'utf8');
  const stateVar = stateText.includes(DEMO);
  const stateRandom = token.length > 0 && stateText.includes(token);
  const statePath = (() => {
    const s = JSON.parse(stateText);
    const r = s.resources.find((x) => x.type === 'random_password');
    return `resources[random_password.api].instances[0].attributes.result = "${r.instances[0].attributes.result.slice(0, 4)}..." (${r.instances[0].attributes.result.length} characters)`;
  })();
  rec.step('grep the secrets in terraform.tfstate     (a plain JSON file)', `demo db password found: ${stateVar}\nrandom password found:  ${stateRandom}\n${statePath}`, 'The state file holds both secrets, in plain text, always. sensitive never changes that. Where the state is kept, and who can read it, is what protects the secrets.');

  const showState = run(['show']);
  const outText = run(['output']);
  const outJson = run(['output', '-json']);
  const showAny = showState.out.includes(DEMO) || (token && showState.out.includes(token));
  const outTextShows = token && outText.out.includes(token);
  const outJsonShows = token && outJson.out.includes(token);
  rec.step(
    'terraform show ; terraform output ; terraform output -json     (what each one prints for the secrets)',
    [`terraform show:          secret printed: ${showAny}`, ...lines(showState.out).filter((l) => /^s+(input|output|result)s/.test(l)).map((l) => `    ${l.trim()}`), `terraform output:        secret printed: ${outTextShows}   (${lines(outText.out).join(' ')})`, `terraform output -json:  secret printed: ${outJsonShows}   (sensitive: ${JSON.parse(outJson.stdout).api_token.sensitive})`].join('\n'),
    'terraform output hides the value. terraform show hides input and result but prints terraform_data.output in clear: that attribute copies the input and Terraform did not carry the sensitive mark over. terraform output -json prints the value, with sensitive set to true as a label. A hidden value is only hidden where Terraform remembers to hide it.',
  );

  // Compare with the predictions.
  const actual = {
    plan_text_shows_variable_secret: planText.includes(DEMO),
    plan_json_shows_variable_secret: jsonShowsVar,
    plan_json_shows_random_secret: token.length > 0 && json.stdout.includes(token),
    plan_file_shows_variable_secret: planFileShows,
    state_file_shows_variable_secret: stateVar,
    state_file_shows_random_secret: stateRandom,
    show_state_text_shows_any_secret: Boolean(showAny),
    output_text_shows_random_secret: Boolean(outTextShows),
    output_json_shows_random_secret: Boolean(outJsonShows),
  };
  let predicted = {};
  try {
    predicted = JSON.parse(readFileSync(join(work, 'predictions.json'), 'utf8'));
  } catch {
    /* an unreadable predictions.json counts as no predictions */
  }
  const rows = Object.keys(actual).map((k) => ({ k, actual: actual[k], predicted: predicted[k], ok: predicted[k] === actual[k] }));
  rec.step(
    'compare predictions.json with what was found',
    rows.map((r) => `${r.ok ? 'ok  ' : 'WRONG'} ${r.k.padEnd(36)} found ${String(r.actual).padEnd(5)} you said ${r.predicted}`).join('\n'),
    rows.every((r) => r.ok) ? 'Every prediction matches.' : 'Every WRONG line is a place where the secret is not where you thought. Read the steps above, change predictions.json, run again.',
  );
  for (const r of rows) setFact(`c6.p3.${r.k}`, r.actual);
  setFact('c6.p3.predictions_correct_count', rows.filter((r) => r.ok).length);
  setFact('c6.p3.predictions_total_count', rows.length);
  setFact('c6.p3.places_with_secret_count', rows.filter((r) => r.actual).length);
  setFact('c6.p3.plan_json_sensitive_flag_set', dbChange.after_sensitive?.input === true);
  setFact('c6.p3.random_password_unknown_in_plan', apiChange.after_unknown?.input === true);

  if (recording()) {
    rec.write(join(here, 'results.md'), `${process.platform}, ${useReference() ? 'reference solution' : 'starter files'}, Node ${process.versions.node}, TFC_MODE=${process.env.TFC_MODE ?? 'default'}`);
    writeFileSync(
      join(here, 'chart.svg'),
      barsSvg({
        title: 'Places where a secret is readable (1 = yes, 0 = no)',
        unit: '',
        bars: [
          { label: 'plan text', value: Number(actual.plan_text_shows_variable_secret) },
          { label: 'plan as JSON', value: Number(actual.plan_json_shows_variable_secret) },
          { label: 'plan file (unzipped)', value: Number(actual.plan_file_shows_variable_secret) },
          { label: 'state file', value: Number(actual.state_file_shows_random_secret) },
          { label: 'terraform show', value: Number(actual.show_state_text_shows_any_secret) },
          { label: 'terraform output', value: Number(actual.output_text_shows_random_secret) },
          { label: 'terraform output -json', value: Number(actual.output_json_shows_random_secret) },
        ],
      }),
    );
    console.log('\nWrote results.md and chart.svg');
  }
  console.log('\nDone. See your numbers with: node toolkit/show-facts.mjs c6.p3');
} catch (e) {
  console.error(`\nStopped: ${e.message}`);
  process.exitCode = 1;
} finally {
  cleanup(N);
}

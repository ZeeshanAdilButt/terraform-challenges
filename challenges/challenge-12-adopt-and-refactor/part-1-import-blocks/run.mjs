// Challenge 12, part 1: adopt hand-built containers with import blocks.
// Run: node challenges/challenge-12-adopt-and-refactor/part-1-import-blocks/run.mjs
// Add --record to also write results.md and chart.svg next to this file (the reference run does).
//
// It builds a network and two containers by hand with the docker command, then tries to bring them under
// Terraform: first the wrong way (names, a generated draft, a naive configuration), then your files.
// It applies your files only when the plan destroys nothing.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { versionLine } from '../../../toolkit/tf.js';
import { assertDocker, cleanup } from '../../../toolkit/docker.js';
import { prepareWork, partDir, recording } from '../../../toolkit/part.js';
import { setFact } from '../../../toolkit/facts.js';
import { Recorder } from '../../../toolkit/record.js';
import { barsSvg } from '../../../toolkit/bars.js';
import { N, WEB, CACHE, tfx, grep, containerId, startedAt, listObjects, handBuild, writeIds, copyTf, read, counts, applied , cleanAll, run } from '../lib.mjs';

const here = partDir(import.meta.url);
const rec = new Recorder('Challenge 12, part 1: adopt hand-built containers with import blocks');
const short = (id) => id.slice(0, 12);
const num = (text, re) => Number((re.exec(text) || [0, 0])[1]);

let engine;
try {
  engine = assertDocker();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

const importsById = `import {
  to = docker_network.net
  id = "tfc-c12-net"
}

import {
  to = docker_container.web
  id = var.web_id
}

import {
  to = docker_container.cache
  id = var.cache_id
}
`;

let failed = false;
try {
  cleanup(N);
  const work = prepareWork(import.meta.url);
  const idsFile = () => read(join(work, 'hand-built.auto.tfvars.json'));

  // Step 1: the stack nobody wrote down.
  const ids = handBuild();
  writeIds(work, ids);
  rec.step(
    'docker network create ... ; docker run -d ... nginx ; docker run -d ... alpine sleep',
    `${listObjects().join('\n')}\nweb id   ${short(ids.web)}...\ncache id ${short(ids.cache)}...`,
    'Three objects exist and no Terraform file describes them. The docker command printed the long ids; Terraform will need them.',
  );

  // Step 2: init.
  const init = tfx(['init'], work);
  rec.step('terraform init', grep(init.out, /Installing|successfully initialized|Error/), 'Same provider pin as every challenge.');

  // Step 3: import a container by its name.
  const names = join(work, 'try-names');
  copyTf(work, names, { skip: ['imports.tf', 'containers.tf', 'network.tf'] });
  writeFileSync(join(names, 'hand-built.auto.tfvars.json'), idsFile());
  writeFileSync(join(names, 'imports.tf'), 'import {\n  to = docker_container.web\n  id = "tfc-c12-web"\n}\n');
  writeFileSync(join(names, 'web.tf'), 'resource "docker_container" "web" {\n  name  = "tfc-c12-web"\n  image = "nginx:1.27-alpine"\n}\n');
  tfx(['init'], names);
  const byName = tfx(['plan'], names);
  rec.step(
    'terraform plan   (import block with id = "tfc-c12-web")',
    grep(byName.out, /Error|While attempting|provider detected|pre-existing/, 12),
    'A container is named tfc-c12-web, and the plan says no such object exists. The provider wants the long container id, not the name.',
  );
  setFact('c12.p1.import_by_name_error', /Cannot import non-existent remote object/.test(byName.out) ? 'Cannot import non-existent remote object' : 'no error');

  // Step 4: generate a draft.
  const draft = join(work, 'draft');
  copyTf(work, draft, { skip: ['imports.tf', 'containers.tf', 'network.tf'] });
  writeFileSync(join(draft, 'hand-built.auto.tfvars.json'), idsFile());
  writeFileSync(join(draft, 'imports.tf'), importsById);
  tfx(['init'], draft);
  const gen = tfx(['plan', '-generate-config-out=generated.tf'], draft);
  const generated = read(join(draft, 'generated.tf'));
  const genLines = generated.split('\n').filter((l) => l.trim()).length;
  const genNulls = (generated.match(/=\s+null\s*$/gm) || []).length;
  rec.step(
    'terraform plan -generate-config-out=generated.tf',
    `${grep(gen.out, /^Plan:|Warning: Config generation/, 4)}\ngenerated.tf: ${genLines} lines, ${genNulls} of them set an argument to null`,
    'Terraform wrote a draft for all three objects. It is a draft: the plan for the draft, in the next step, shows what is wrong with it.',
  );
  setFact('c12.p1.generated_lines_count', genLines);
  setFact('c12.p1.generated_null_arguments_count', genNulls);

  // Step 5: plan the draft as it is.
  const draftPlan = tfx(['plan'], draft);
  const dc = counts(draftPlan.out);
  rec.step(
    'terraform plan   (the generated draft, untouched)',
    grep(draftPlan.out, /must be replaced|forces replacement|will be imported|^Plan:/, 12),
    'Importing is not enough. The draft replaces both containers. The line that says why: env is not set, and a changed env forces a replacement.',
  );
  setFact('c12.p1.draft_plan_import_count', num(draftPlan.out, /Plan: (\d+) to import/));
  setFact('c12.p1.draft_plan_add_count', dc?.add ?? -1);
  setFact('c12.p1.draft_plan_destroy_count', dc?.destroy ?? -1);

  // Step 6: the naive configuration (the starter containers.tf).
  const naive = join(work, 'naive');
  copyTf(work, naive, { skip: ['imports.tf', 'containers.tf'] });
  writeFileSync(join(naive, 'hand-built.auto.tfvars.json'), idsFile());
  writeFileSync(join(naive, 'imports.tf'), importsById);
  writeFileSync(join(naive, 'containers.tf'), read(join(here, 'faults', 'containers.tf')));
  tfx(['init'], naive);
  const naivePlan = tfx(['plan'], naive);
  const nc = counts(naivePlan.out);
  rec.step(
    'terraform plan   (starter containers.tf: networks_advanced, labels, no env)',
    grep(naivePlan.out, /must be replaced|forces replacement|^Plan:/, 16),
    'The configuration a person writes from the docker command is worse than the draft: the labels and the network block each force a replacement too.',
  );
  setFact('c12.p1.naive_plan_add_count', nc?.add ?? -1);
  setFact('c12.p1.naive_plan_destroy_count', nc?.destroy ?? -1);
  setFact('c12.p1.naive_forces_replacement_count', (naivePlan.out.match(/# forces replacement/g) || []).length);

  // Step 7: the learner's files.
  const before = { web: containerId(WEB), cache: containerId(CACHE), webStart: startedAt(WEB), cacheStart: startedAt(CACHE) };
  const plan = tfx(['plan'], work);
  const pc = counts(plan.out);
  const imports = num(plan.out, /Plan: (\d+) to import/);
  rec.step(
    'terraform plan   (your imports.tf and containers.tf)',
    grep(plan.out, /will be imported|must be replaced|will be updated|forces replacement|^Plan:|^Error/, 14),
    'The plan to aim for: three imports, nothing to add, nothing to destroy. The in-place changes are the provider filling in arguments that exist only in its own state (attach, logs, must_run, start, wait).',
  );
  setFact('c12.p1.plan_import_count', imports);
  setFact('c12.p1.plan_add_count', pc?.add ?? -1);
  setFact('c12.p1.plan_change_count', pc?.change ?? -1);
  setFact('c12.p1.plan_destroy_count', pc?.destroy ?? -1);

  if (!pc || pc.destroy > 0 || pc.add > 0 || imports < 3) {
    failed = true;
    console.log(`\nStopping before apply: this plan would add ${pc?.add ?? '?'} and destroy ${pc?.destroy ?? '?'} objects and import ${imports} of 3.`);
    console.log('Change containers.tf and imports.tf until the plan says 3 to import, 0 to add, 0 to destroy, then run this again.');
  } else {
    // Step 8: apply.
    const apply = tfx(['apply', '-auto-approve'], work);
    const ac = applied(apply.out);
    rec.step('terraform apply -auto-approve', grep(apply.out, /Import complete|Modifications complete|^Apply complete|^Error/, 12), 'The imports and the two in-place changes only write to the state. Docker is not asked to change anything.');
    setFact('c12.p1.apply_imported_count', ac?.imported ?? -1);
    setFact('c12.p1.apply_added_count', ac?.added ?? -1);
    setFact('c12.p1.apply_changed_count', ac?.changed ?? -1);
    setFact('c12.p1.apply_destroyed_count', ac?.destroyed ?? -1);

    // Step 9: same containers?
    const after = { web: containerId(WEB), cache: containerId(CACHE), webStart: startedAt(WEB), cacheStart: startedAt(CACHE) };
    const sameIds = Number(before.web === after.web) + Number(before.cache === after.cache);
    const sameStart = Number(before.webStart === after.webStart) + Number(before.cacheStart === after.cacheStart);
    rec.step(
      'docker inspect (id and StartedAt of both containers, before and after the apply)',
      `web    id ${short(before.web)} -> ${short(after.web)}   started ${before.webStart} -> ${after.webStart}\ncache  id ${short(before.cache)} -> ${short(after.cache)}   started ${before.cacheStart} -> ${after.cacheStart}`,
      'Same id and same start time: the containers were adopted, not recreated.',
    );
    setFact('c12.p1.container_ids_kept_count', sameIds);
    setFact('c12.p1.container_restarts_count', 2 - sameStart);

    // Step 10: a second plan.
    const again = tfx(['plan'], work);
    rec.step('terraform plan', grep(again.out, /No changes|^Plan:|Error/, 4), 'Nothing left to do: the code, the state and Docker agree.');
    setFact('c12.p1.second_plan_no_changes', /No changes\./.test(again.out));

    // Step 11: state.
    const list = tfx(['state', 'list'], work);
    rec.step('terraform state list', list.out.trim(), 'All three objects are in the state now, with the addresses of your configuration.');
    setFact('c12.p1.state_resources_count', list.out.trim().split('\n').filter(Boolean).length);

    const svg = barsSvg({
      title: 'Objects the plan would destroy while adopting two containers',
      unit: 'destroyed',
      bars: [
        { label: 'naive configuration', value: nc?.destroy ?? 0 },
        { label: 'generated draft', value: dc?.destroy ?? 0 },
        { label: 'your cleaned files', value: pc?.destroy ?? 0 },
      ],
    });
    if (recording()) writeFileSync(join(here, 'chart.svg'), svg);
  }
} finally {
  const { removed, left } = cleanAll();
  console.log(`\nCleanup: removed ${removed.containers.length} containers and ${removed.networks.length} networks; left ${left.containers + left.networks + left.volumes}.`);
  if (recording() && !failed) rec.write(join(here, 'results.md'), `Windows 11, Docker Desktop, Engine ${engine}, ${versionLine()} (${process.env.TFC_MODE || 'auto'} mode), Node ${process.versions.node}`);
}
process.exit(failed ? 1 : 0);

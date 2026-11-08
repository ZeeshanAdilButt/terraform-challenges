// The plan gate. Reads the JSON that `terraform show -json <planfile>` prints and blocks the plan when it would
// destroy or replace a resource that is tagged protected. Plain Node, no packages.
//
// Use it:   terraform show -json plan.tfplan | node gate.mjs
//      or:  node gate.mjs plan.json
// Exit code 0: the plan may go on. Exit code 1: blocked. Exit code 2: the input is not a plan.
//
// Your job: write isProtected and removesResource below. The JSON you need looks like this (cut down):
//
//   { "format_version": "1.2",
//     "resource_changes": [
//       { "address": "docker_container.db[0]",
//         "type": "docker_container",
//         "change": {
//           "actions": ["delete", "create"],          // a replacement. A plain destroy is ["delete"].
//           "before": { "name": "tfc-c8-db", "labels": [ { "label": "tfc.protected", "value": "true" } ] },
//           "after":  { "name": "tfc-c8-db2", "labels": [ ... ] } } } ] }
//
// "Protected" means: the resource, as it is NOW (the before object), carries the label tfc.protected = "true".
// Look at before, not after: a plan could remove the label and the resource in the same step.
// A resource that is only being created has before = null and nothing to protect.

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** True when this resource change touches a resource that is tagged protected. */
export function isProtected(change) {
  // TODO: look at change.change.before.labels (an array of { label, value }).
  return false;
}

/** True when the actions remove the existing resource: a destroy or a replacement. */
export function removesResource(actions) {
  // TODO: "delete" in the actions means the existing object goes away (alone, or as half of a replacement).
  return false;
}

/** Every change in the plan that removes a protected resource. Returns [{ address, actions }]. */
export function findViolations(plan) {
  const changes = plan.resource_changes ?? [];
  return changes
    .filter((c) => isProtected(c) && removesResource(c.change.actions))
    .map((c) => ({ address: c.address, actions: c.change.actions }));
}

function main() {
  const file = process.argv[2];
  let plan;
  try {
    plan = JSON.parse(readFileSync(file ?? 0, 'utf8'));
  } catch (e) {
    console.error(`gate: cannot read a plan: ${e.message}`);
    process.exit(2);
  }
  if (!Array.isArray(plan.resource_changes)) {
    console.error('gate: this is not a plan (no resource_changes). Pass the output of terraform show -json <planfile>.');
    process.exit(2);
  }
  // TODO: terraform saves a plan even when planning failed. That plan has "errored": true and cannot be applied.
  // Refuse it: print "BLOCKED: the plan has errors and cannot be applied." and exit 1.
  const violations = findViolations(plan);
  for (const v of violations) {
    console.log(`BLOCKED: ${v.address} would be ${v.actions.join(' then ')}, and it is tagged protected.`);
  }
  if (violations.length > 0) process.exit(1);
  console.log(`gate: ok, ${plan.resource_changes.length} resource changes, none removes a protected resource.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();

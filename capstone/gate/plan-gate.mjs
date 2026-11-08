// The plan gate. It reads the JSON that `terraform show -json <planfile>` prints and blocks the plan when it would
// destroy or replace a resource that is labelled protected. Plain Node, no packages.
//
//   terraform show -json dev.tfplan | node capstone/gate/plan-gate.mjs
//   node capstone/gate/plan-gate.mjs dev.plan.json
//
// Exit code 0: the plan may go on. Exit code 1: blocked. Exit code 2: the input is not a plan.
//
// The JSON looks like this (cut down):
//
//   { "format_version": "1.2",
//     "resource_changes": [
//       { "address": "module.service.docker_container.cache",
//         "type": "docker_container",
//         "change": {
//           "actions": ["delete", "create"],     // a replacement. A plain destroy is ["delete"]. create-before-destroy is ["create", "delete"].
//           "before": { "labels": [ { "label": "tfc.protected", "value": "true" } ] },
//           "after":  { "labels": [ ... ] } } } ] }
//
// "Protected" means: the resource as it is NOW (the before object) carries the label tfc.protected = "true".
// Read before, not after: a plan could remove the label and the resource in the same step.
// A resource that is only being created has before = null and nothing to protect.
//
// TODO (part 2): write isProtected, removesResource, and the two checks in main (errored plan, violations).

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** True when this resource change touches a resource that is labelled protected. */
export function isProtected(change) {
  // TODO: look at change.change.before.labels (an array of { label, value }). It can be missing or null.
  return false;
}

/** True when the actions remove the existing resource: a destroy, or a replacement in either order. */
export function removesResource(actions) {
  // TODO: "delete" in the actions means the existing object goes away, alone or as half of a replacement.
  return false;
}

/** Every change in the plan that removes a protected resource. Returns [{ address, actions }]. */
export function findViolations(plan) {
  return (plan.resource_changes ?? [])
    .filter((c) => isProtected(c) && removesResource(c.change.actions))
    .map((c) => ({ address: c.address, actions: c.change.actions }));
}

function main() {
  let plan;
  try {
    plan = JSON.parse(readFileSync(process.argv[2] ?? 0, 'utf8'));
  } catch (e) {
    console.error(`gate: cannot read a plan: ${e.message}`);
    process.exit(2);
  }
  if (!Array.isArray(plan.resource_changes)) {
    console.error('gate: this is not a plan (no resource_changes). Pass the output of terraform show -json <planfile>.');
    process.exit(2);
  }
  // TODO: terraform saves a plan even when planning failed. That plan has "errored": true and cannot be applied.
  // Refuse it: print "BLOCKED: the plan has errors and cannot be applied." and exit with code 1.
  const violations = findViolations(plan);
  // TODO: print one line per violation: "BLOCKED: <address> would be <actions joined with ' then '>, and it is labelled protected."
  // Then exit with code 1 when there is at least one.
  console.log(`gate: ok, ${plan.resource_changes.length} resource changes, none removes a protected resource. (${violations.length} violations)`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();

// The two small jobs of a drift check that runs in a pipeline.
//
// 1. `terraform plan -detailed-exitcode` ends with an exit code:
//      0  succeeded, nothing to change
//      1  error
//      2  succeeded, there ARE changes
//    A job that treats every non-zero code as "drift" will report a typing mistake or a lost
//    network as drift. verdict() turns the code into one word.
//
// 2. `terraform plan -refresh-only -out=drift.tfplan` followed by `terraform show -json drift.tfplan`
//    gives a JSON plan. In a refresh-only plan nothing is planned to change, so the list of
//    planned changes is empty. What changed outside of Terraform is listed under another key.
//    driftedAddresses() returns the addresses of those resources, sorted.

/** 'clean', 'changes' or 'error'. */
export function verdict(exitCode) {
  // FIX 1: exit code 1 is an error, not drift. Only 2 means changes.
  return exitCode === 0 ? 'clean' : 'changes';
}

/** The addresses of the resources that changed outside of Terraform, sorted. */
export function driftedAddresses(plan) {
  // FIX 2: this reads the planned changes. In a refresh-only plan that list is empty.
  // Look in the plan JSON for the key that holds what drifted.
  return (plan.resource_changes ?? []).map((c) => c.address).sort();
}

# Challenge 8, part 3: a plan gate

**Time:** about 60 minutes. **Download:** none beyond what earlier parts cached (the Docker provider, `alpine:3.23`). **Safety rules:** [SAFETY.md](../../../SAFETY.md)

## The problem

A pull request renames the database container. The diff is one line. The reviewer reads it as a rename. The plan says `1 to add, 0 to change, 1 to destroy`, nobody reads the plan, and the merge applies it: the old database is destroyed and a new empty one is created.

Tests (part 1) check that your code does what you meant. They cannot know which resource is precious. A **gate** is a check that reads the plan, the list of what Terraform is about to do, and stops it when the plan breaks a rule about the real world: never destroy anything tagged protected.

## The idea

`terraform plan -out=plan.tfplan` saves the plan. `terraform show -json plan.tfplan` prints it as JSON. Inside is `resource_changes`, one entry per resource, and for each one:

| Field | Meaning |
|---|---|
| `address` | The resource, for example `docker_container.db[0]`. |
| `change.actions` | `["create"]`, `["update"]`, `["no-op"]`, `["delete"]`, or `["delete","create"]` for a replacement. |
| `change.before` | The resource as it is now. `null` when it does not exist yet. |
| `change.after` | The resource as the plan would leave it. |

A gate is a small program that reads that JSON and exits non-zero when a rule is broken. Any pipeline can run it between plan and apply. It needs no Terraform feature and no extra service: only the plan.

Terraform has three other tools that sound similar. Know which stops what:

| Tool | Where it runs | What it does when it fails |
|---|---|---|
| `check` block | During plan | A **warning**. The plan carries on. It cannot stop anything. |
| `lifecycle { precondition }` | During plan | An **error**. The plan stops. A plan file is still written, marked `errored`, and apply refuses it. |
| A gate script (this part) | After plan, on the plan file | Whatever you decide: here, exit code 1 and `BLOCKED:`. |

The stack: a network, a database container tagged `tfc.protected = "true"` and a web container. You write the rule in `gate.mjs`: block any plan that deletes or replaces a protected resource. Look at the `before` object, not `after`: a plan that removes the label and the resource in one step must still be blocked.

## Steps

| # | Command | What happens |
|---|---|---|
| 1 | `node challenges/challenge-8-tests-and-gate/part-3-plan-gate/run.mjs` | Applies the stack, makes three plans (replace the web container, replace the database, remove the database), pipes each plan JSON through `gate.mjs`, then tries a `check` block, a `precondition` and `-policies`. On the starter the gate lets everything through. |
| 2 | `node --test challenges/challenge-8-tests-and-gate/part-3-plan-gate/test.mjs` | Fails on purpose. |
| 3 | Write `isProtected` and `removesResource` in `gate.mjs`, and refuse an errored plan | The comments show the JSON and where the errored plan goes. |
| 4 | Run step 1 again | The web replacement passes (exit 0). Both database plans print `BLOCKED:` and exit 1. |
| 5 | `node --test challenges/challenge-8-tests-and-gate/part-3-plan-gate/test.mjs` | Passes. The unit tests feed `gate.mjs` made-up plans, including the tricky ones. |
| 6 | `node toolkit/show-facts.mjs c8.p3` | Shows the saved facts. |

The solution is in `reference/gate.mjs`. `TFC_REFERENCE=1 node challenges/challenge-8-tests-and-gate/part-3-plan-gate/run.mjs` runs it.

## What you should see

On the reference, three plans, three different outcomes (full output in [results.md](results.md)):

```text
-var web_name=tfc-c8-web2   Plan: 1 to add, 0 to change, 1 to destroy.   gate: ok ...                      exit 0
-var db_name=tfc-c8-db2     Plan: 1 to add, 0 to change, 1 to destroy.   BLOCKED: docker_container.db[0] ...  exit 1
-var with_db=false          Plan: 0 to add, 0 to change, 1 to destroy.   BLOCKED: docker_container.db[0] ...  exit 1
```

The two plans that differ in meaning have the same counts. `Plan: 1 to add, 1 to destroy` says nothing about which resource goes. The gate does.

Then the other tools: `web_memory_mb=200` gives `Warning: Check block assertion failed` from the `check` block and exit code 0. `db_memory_mb=8` stops the plan with `Error: Resource precondition failed` and exit code 1, but **a plan file is written anyway**: `terraform show -json` of it says `"errored": true`, and `terraform apply` refuses it with `Cannot apply incomplete plan`. A gate that only looks for destroy actions would read that file and see nothing wrong, so your gate must refuse an errored plan too.

Last, `terraform plan -policies=./policies`. Terraform 1.17 made Terraform Policy generally available, and this flag runs it. In the recorded run the flag is accepted and the plan is printed, but the policy engine is a separate program called `tfpolicy-plugin` that the official image does not contain: `Error: Failed to connect to policy engine` comes after the plan, and the **exit code is still 0**. A pipeline that checks only the exit code would pass. The gate above does the same job with no extra program. Policy is therefore not a step you can run with this toolkit; a team that adopts it installs the plugin and writes policies in HCL.

## Where each number comes from

| Fact | Where it comes from |
|---|---|
| `c8.p3.init_ok` | Exit code of `terraform init`. |
| `c8.p3.baseline_added_count` | `N added` of the first apply: image, network, database, web. 4. |
| `c8.p3.gate_web_replace_exit_code`, `c8.p3.gate_db_replace_exit_code`, `c8.p3.gate_db_remove_exit_code` | Exit codes of `gate.mjs` for the three plans. 0, 1, 1 is right. |
| `c8.p3.gate_blocked_lines_count` | `BLOCKED:` lines printed over the three plans. |
| `c8.p3.check_warns_and_continues` | The plan with `web_memory_mb=200` exited 0 and printed the check warning. |
| `c8.p3.precondition_stops_plan` | The plan with `db_memory_mb=8` failed with a precondition error. |
| `c8.p3.errored_plan_file_written`, `c8.p3.errored_plan_json_errored`, `c8.p3.errored_plan_apply_error` | A plan file exists after that failed plan, its JSON has `errored` true, and the first error line of `terraform apply` on it. |
| `c8.p3.policy_plugin_missing`, `c8.p3.policy_exit_code` | The output of `terraform plan -policies=./policies` names `tfpolicy-plugin`, and the exit code of that command. |
| `c8.p3.destroyed_count`, `c8.p3.leftover_count` | `N destroyed` of the final destroy, and Docker objects still labelled `tfc.challenge=8`. |

## What is different on your platform

- **Linux and WSL2, Docker Desktop, Codespace:** the same. `gate.mjs` runs with the Node on your machine; only Terraform runs in the container.
- **Local binary:** the same JSON. `-policies` also needs the plugin; check with your own install.
- **Your own pipeline:** `terraform show -json plan.tfplan | node gate.mjs` works in any CI. Keep the saved plan and apply that exact file, so what the gate approved is what runs (challenge 11).

## Stuck?

- The gate says `ok` for the database plan: `isProtected` must read `change.before.labels`, an array of `{ label, value }`, and match `tfc.protected` with the value `"true"`.
- A plain destroy of the database is not blocked but the replacement is: `removesResource` must look for `"delete"` in the actions, alone or with `"create"`.
- A create is blocked: a create has `before = null`. There is nothing to protect yet.
- The errored-plan test fails: the plan JSON has a top-level `errored` field. When it is `true`, print `BLOCKED: the plan has errors and cannot be applied.` and exit 1.
- Something is left over from a crashed run: `node toolkit/cleanup.mjs 8`.
- The test still fails after you fixed `gate.mjs`: run step 1 first. The tests load the copy in `work/`.

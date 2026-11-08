# Challenge 6, part 2: drift and refresh-only

**Time:** about 40 minutes. **Download:** the `kreuzwerker/docker` provider (about 75 MB, first run only). The container uses `alpine:3.23`, which you pulled in challenge 0. **Docker:** one labelled container, `tfc-c6-app`. **Safety rules:** [SAFETY.md](../../../SAFETY.md)

## The problem

Nobody touched the Terraform code. The nightly job runs `terraform plan` and says it wants to **destroy the production container and build a new one**. The reason: someone renamed the container by hand last week, in a hurry, with `docker rename`. Terraform reads the real name, sees that it does not match the code, and plans to put it right the only way a name can be put right: replace the thing.

That is **drift**: the real world changed behind Terraform's back. The state still remembers what Terraform made. The plan compares the code with what is really there. This part makes you cause drift, find it with the right command, and read the exit codes that a pipeline relies on.

## The idea

- **Refresh** is Terraform asking the real world "what do you look like now?" and updating its picture. Every normal `plan` and `apply` refreshes first.
- `terraform plan -refresh-only` refreshes and **only reports** what changed outside Terraform. It plans no action. This is the safe way to look for drift.
- `terraform apply -refresh-only` writes what it found into the **state**. It changes nothing in the real world and nothing in your code. Afterwards the normal plan can still want to change things, because the code still disagrees.
- Ending drift is a decision with two honest answers: put the real world back, or change the code to match it. Only a person can say which.
- `terraform plan -detailed-exitcode` ends with exit code **0** (no changes), **1** (an error) or **2** (changes). A pipeline that fails on any non-zero code will call a typing mistake "drift".
- `-minimal-refresh` (Terraform 1.17) refreshes only the resources that already have a planned change. It is faster on a big state. It cannot see drift on anything else.

In the JSON of a refresh-only plan (`terraform show -json drift.tfplan`), the planned changes are empty, because nothing is planned. What drifted is listed under `resource_drift`.

## The files

| File | What it is |
|---|---|
| `main.tf` | One labelled container and one small record. Do not edit. |
| `drift.mjs` | **Yours.** `verdict(exitCode)` turns an exit code into `clean`, `changes` or `error`. `driftedAddresses(plan)` returns the sorted addresses of the resources that drifted. The starter has one fault in each. |
| `fixtures/drift-plan.json` | The refresh-only plan of the recorded run, trimmed. The test uses it, so it runs without Docker. |

## Steps

| # | Command | What happens |
|---|---|---|
| 1 | `node --test challenges/challenge-6-plans-and-drift/part-2-drift-and-refresh-only/test.mjs` | Fails on purpose. |
| 2 | Edit `drift.mjs` | Read the `FIX` comments. |
| 3 | `node --test challenges/challenge-6-plans-and-drift/part-2-drift-and-refresh-only/test.mjs` | Repeat until the unit tests pass. No Docker needed. |
| 4 | `node challenges/challenge-6-plans-and-drift/part-2-drift-and-refresh-only/run.mjs` | Creates the container, renames it with the docker CLI, shows plan, refresh-only plan and apply, exit codes, and also stops it to show `-minimal-refresh`. About 2 minutes. |
| 5 | `node --test .../test.mjs` again, then `node toolkit/show-facts.mjs c6.p2` | The last tests read what `run.mjs` found. |

Add `--reference` to `run.mjs` or the test, or set `TFC_REFERENCE=1`, to use the solution in `reference/`.

## What you should see

1. `terraform plan -detailed-exitcode` right after the apply: `No changes. Your infrastructure matches the configuration.` and exit code 0.
2. With a missing variables file: `Error: Failed to read variables file`, exit code 1. A correct `verdict(1)` says `error`.
3. After `docker stop tfc-c6-app` (before any other change): `plan -minimal-refresh -detailed-exitcode` prints `No changes.` (exit code 0, and no "Refreshing state" line at all). A plain `plan -detailed-exitcode` refreshes both resources and plans an in-place update, `must_run` from false to true (exit code 2). Then `docker start` and the plan is clean again.
4. After `docker rename tfc-c6-app tfc-c6-app-moved`:

```text
  # docker_container.app must be replaced
      ~ name  = "tfc-c6-app-moved" -> "tfc-c6-app" # forces replacement
Plan: 1 to add, 0 to change, 1 to destroy.
```

   Exit code 2.
5. `terraform plan -refresh-only`: `Note: Objects have changed outside of Terraform`, then `docker_container.app has changed` with the name line, and `This is a refresh-only plan, so Terraform will not take any actions to undo these.` Exit code 2. In its JSON, `resource_changes` is empty and `resource_drift` has one entry.
6. `terraform apply -refresh-only -auto-approve`: `Apply complete! Resources: 0 added, 0 changed, 0 destroyed.` The state file now holds the new name. The next plan **still** says `Plan: 1 to add, 0 to change, 1 to destroy.` (exit 2).
7. After `docker rename` back, the plan is clean (exit 0).

The full recorded run is in [results.md](results.md).

![Exit codes by situation](chart.svg)

## Where each number comes from

| Fact | Where it comes from |
|---|---|
| `c6.p2.exit_code_clean`, `c6.p2.exit_code_error`, `c6.p2.error_line` | Exit codes of `plan -detailed-exitcode` with nothing changed and with a missing variables file, and the `Error:` line. |
| `c6.p2.verdict_clean`, `c6.p2.verdict_error`, `c6.p2.verdict_changes` | What your `verdict()` returned for those exit codes. |
| `c6.p2.exit_code_rename_plan`, `c6.p2.rename_plan_add_count`, `c6.p2.rename_plan_destroy_count` | The plan after `docker rename`. |
| `c6.p2.exit_code_refresh_only_plan`, `c6.p2.refresh_only_resource_changes_count`, `c6.p2.refresh_only_resource_drift_count`, `c6.p2.refresh_only_name_line` | The refresh-only plan and its JSON. |
| `c6.p2.drifted_addresses` | What your `driftedAddresses()` returned for that JSON. |
| `c6.p2.refresh_only_apply_exit_code`, `c6.p2.state_name_after_refresh_only`, `c6.p2.exit_code_plan_after_refresh_only_apply`, `c6.p2.plan_after_refresh_only_destroy_count` | `apply -refresh-only`, the container name inside `terraform.tfstate` afterwards, and the plan after it. |
| `c6.p2.exit_code_after_revert` | The plan after renaming the container back. |
| `c6.p2.minimal_refresh_exit_code`, `c6.p2.minimal_refresh_refreshed_count`, `c6.p2.minimal_refresh_sees_stop` | `plan -minimal-refresh` after `docker stop`: exit code, number of `Refreshing state` lines, and whether it noticed (exit code 2). |
| `c6.p2.full_plan_exit_code_after_stop`, `c6.p2.full_plan_refreshed_count` | The same without `-minimal-refresh`. |
| `c6.p2.exit_code_after_start` | The plan after `docker start`. |
| `c6.p2.state_resources_count` | Resources in `terraform.tfstate` at the end. |

## What is different on your machine

- **Linux and WSL2, Docker Desktop, Codespace:** the same lines. By default the toolkit runs Terraform 1.17.1 from the pinned image and mounts the Docker socket (the one named exception in [SAFETY.md](../../../SAFETY.md)). A local binary of 1.17 or newer prints the same, apart from ids. `-minimal-refresh` needs Terraform 1.17 or newer.
- Container ids and some lines of the refresh-only report (empty lists the provider adds, network details) differ between runs and between Docker versions. The `name` line is the one to read.
- In a container the docker CLI here is yours, on your machine: only `run.mjs` calls `docker rename` and `docker stop`, and only on `tfc-c6-app`.

## Stuck?

- `verdict` test still fails: three exit codes, three answers. Do not use `!== 0`.
- `driftedAddresses` finds nothing: print `Object.keys(plan)` and look for the key with "drift" in it.
- Leftover container from a stopped run: `node toolkit/cleanup.mjs 6`.
- `Failed to install provider` or similar: another run was writing the shared plugin cache. `run.mjs` retries by itself.

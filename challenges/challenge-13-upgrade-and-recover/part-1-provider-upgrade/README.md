# Challenge 13, part 1: upgrade a provider and read what changed

**Time:** about 45 minutes. **Download:** the `random` and `local` providers in two versions each (a few MB each), and the image `hashicorp/terraform:1.16.7` (about 200 MB) for the last two steps. **Safety rules:** [SAFETY.md](../../../SAFETY.md). No Docker objects are made in this part.

## The problem

Last spring the team applied this code and nobody touched it since. Today someone runs `terraform init -upgrade` "to get current", sees the plan, and merges. A month later a provider drops the argument the code used, and a plain `terraform plan` stops with an error in production code nobody has opened for a year.

An upgrade is a change like any other. It needs a diff to read, a before and an after, and a way back.

## The idea

**Provider.** A provider is the plugin that knows how to talk to one kind of thing (Docker, a file, a random number). It has its own version, separate from Terraform's.

**Constraint.** In `required_providers` you say which versions the code accepts: `"3.1.3"` (exactly this), `"~> 3.9"` (3.9 or newer, never 4.0), `">= 3.1"` (this or anything newer, including a new major version). A constraint says what is allowed.

**Lock file.** `.terraform.lock.hcl` says which version was actually chosen, with checksums. `terraform init` keeps the locked version even when a newer one is allowed. Only `terraform init -upgrade` moves it. You commit the lock file, and a provider upgrade shows up in a pull request as a change to that file.

**Deprecation.** Providers rename arguments over time. The old name keeps working for a while and produces a **warning**. Later the old name is removed, and the warning becomes an error. A warning is the cheapest time to fix it.

In this part you pin the constraints, run the upgrade, fix what it warns about, and end with a plan that says `No changes`. Then you run the same code with two Terraform releases and see what differs.

## What is in this folder

| File | What it is |
|---|---|
| `before/` | The OLD code with exact pins (`random` 3.1.3, `local` 2.1.0). `run.mjs` and the test apply it first. Do not edit. |
| `versions.tf` | **Fault planted.** The constraints are `>= 3.1` and `>= 2.1`. |
| `main.tf` | **Fault planted.** It uses the argument `number` of two `random` resources, which newer versions of the provider mark as deprecated. |

## Steps

| # | Command | What happens |
|---|---|---|
| 1 | `node challenges/challenge-13-upgrade-and-recover/part-1-provider-upgrade/run.mjs` | Applies the old code, shows what the lock file protects, upgrades with your files, then compares Terraform 1.16.7 and 1.17.1. It tells you what is not finished. About 4 minutes. |
| 2 | `node --test challenges/challenge-13-upgrade-and-recover/part-1-provider-upgrade/test.mjs` | Fails on purpose. Each failure says what to change. |
| 3 | Edit `versions.tf` | Bound both providers with `~>`: `"~> 3.9"` for `random`, `"~> 2.9"` for `local`. |
| 4 | Edit `main.tf` | Replace the deprecated argument by the one the warning names. |
| 5 | Run step 1 again, then the test | `terraform validate` shows 0 warnings, the plan says `No changes.`, the lock file records 3.9.1 and 2.9.1. |
| 6 | `node toolkit/show-facts.mjs c13.p1` | Shows the saved facts. |

## What you should see

The recorded run is in [results.md](results.md). In short:

1. **The old code is clean on the old versions:** `terraform validate` gives 0 warnings. The lock file says `3.1.3` with constraint `3.1.3`.
2. **The lock wins over the constraint.** With the constraint loosened to `>= 3.1`, a plain `init` still reuses 3.1.3 (`Reusing version 3.1.3 of hashicorp/random from the dependency lock file`). Newer versions exist; init does not take them.
3. **A new constraint that does not fit the lock is an error until you upgrade on purpose:** `Error: Failed to query available provider packages` ... `3.1.3 does not match configured version constraint ~> 3.9; must use terraform init -upgrade to allow selection of new versions`.
4. **The upgrade did not change the plan.** The old code on the new versions (3.9.1 and 2.9.1) still plans `No changes.` But `terraform validate` now prints 2 warnings, both `Attribute Deprecated` (`**NOTE**: This is deprecated, use numeric instead.`). Nothing is broken today, and nothing in the plan tells you. That is why you read warnings, not only the plan.
5. **After your fix:** 0 warnings and `No changes.`. The lock file diff (`3.1.3` to `3.9.1`, `2.1.0` to `2.9.1`) is what goes into the pull request.
6. **Two Terraform releases, same code:** the plan is `No changes.` with both. The differences are small: 1.16.7 prints `Reusing previous version of hashicorp/random from the dependency lock file`, 1.17.1 prints `Reusing version 3.9.1 of hashicorp/random from the dependency lock file`; `terraform version -json` has a `format_version` field in 1.17.1 and not in 1.16.7.
7. **Terraform did not refuse to go back.** 1.16.7 applied on a state that 1.17.1 had written and rewrote `terraform_version` in the file to `1.16.7`. Nothing stops a teammate with an older Terraform. Use `required_version` in the `terraform` block and one pinned version in CI.

The search for a plan that changes: the same check, `apply` with an old version and `plan` after an upgrade, gave `No changes.` for the Docker provider from 3.6.1, 4.0.0, 4.2.0 and 4.5.0 to 4.6.0 on a container and a network. This challenge does not claim that provider upgrades always change plans. It teaches you to check.

![Warnings from terraform validate](chart.svg)

## Where each number comes from

| Fact | Where it comes from |
|---|---|
| `c13.p1.old_random_version`, `c13.p1.old_local_version`, `c13.p1.old_code_warnings_count` | The lock file and `terraform validate -json` after the old code was applied. |
| `c13.p1.loose_init_keeps_random_version` | The lock file after `init` with the loosened constraint. |
| `c13.p1.plain_init_refuses_new_constraint`, `c13.p1.new_random_version`, `c13.p1.new_local_version` | `init` and `init -upgrade` with the new constraints, on the original code. |
| `c13.p1.original_code_warnings_after_upgrade_count`, `c13.p1.original_code_plan_no_changes_after_upgrade`, `c13.p1.deprecation_warning_text` | `validate -json` and `plan` on the original code after the upgrade. |
| `c13.p1.your_random_version`, `c13.p1.your_random_constraint`, `c13.p1.your_warnings_count`, `c13.p1.your_plan_*_count` | The same checks on your files. |
| `c13.p1.terraform_old_*`, `c13.p1.terraform_new_*` | The version line, `version -json`, `init` wording and `plan` of Terraform 1.16.7 and 1.17.1 in your folder. |
| `c13.p1.state_version_after_new_apply`, `c13.p1.state_version_after_old_apply`, `c13.p1.older_terraform_applied_on_newer_state` | `terraform_version` in the state file after an apply with 1.17.1 and then with 1.16.7. |

## Platform box

- **Linux and WSL2, Docker Desktop, Codespace:** the same output. Provider versions are the newest the registry offers within your constraint. If a newer `random` than 3.9.1 exists on the day you run this, your lock file will show it; the counts do not change.
- **A local Terraform binary of 1.17 or newer** gives the same output for steps 1 to 5. Steps 6 and 7 always use the container image `hashicorp/terraform:1.16.7`, so they need Docker even when you have Terraform installed.

Related: part 2 recovers from a failed apply, part 3 runs the same code with OpenTofu.

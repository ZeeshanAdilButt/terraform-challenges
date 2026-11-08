# Challenge 13, part 2: an apply that fails halfway

**Time:** about 50 minutes. **Download:** none (`nginx:1.27-alpine`, `alpine:3.23` and the Docker provider come from earlier challenges). **Safety rules:** [SAFETY.md](../../../SAFETY.md). Host port `8841` and `8842` on `127.0.0.1` are used; the lock demo uses a small state server on port `8840`.

## The problem

The pipeline applies a change. Three minutes in, the job goes red: `Error: Unable to start container ... port is already allocated`. Half of the stack exists. The person on call asks: "Can I just run it again?"

The answer depends on what the failure left behind, and most people have never looked. This part makes you look: the state, Docker, and the plan, in that order. Then you recover without touching what works.

## The idea

**An apply is not a transaction.** Terraform builds resources one after another, in dependency order. When one fails, Terraform stops and does **not** undo the ones it already built. Those stay built, and they are in the state.

**Tainted.** If Terraform created an object but something went wrong while it was being created (here, the container was created but could not start), it marks the resource **tainted** in the state: "this exists, but I do not trust it". The next plan replaces it: `docker_container.second is tainted, so must be replaced`.

**Recovery is: fix the cause, then plan, then apply.** The plan tells you what Terraform will do about the partial state. A second `apply` continues from where the first stopped: finished resources stay as they are.

**`apply -replace=ADDRESS`** says "build this one again, even though Terraform thinks it is fine". It is the surgical tool for "up but wrong". It replaces what you name and nothing else. (It replaces the older `terraform taint` command.)

**A stuck lock.** With a shared state (a backend that locks), a run takes the lock first and gives it back at the end. If the run is killed (a crashed runner, a lost network), the lock stays. The next plan stops with `Error acquiring the state lock` and prints who holds it. The runbook:

1. Read the lock info: its ID, `Who`, `Created`, `Version`.
2. Find out whether that run is still alive. If it is, wait. Do not unlock a live run.
3. If it is dead: `terraform force-unlock -force <ID>`.
4. Run a `plan` before the next `apply`: a killed apply may have written part of the state.

## What is in this folder

| File | What it is |
|---|---|
| `main.tf` | **Fault planted.** A network and three containers. `first` and `second` both publish host port 8841. `second` waits for `first`, `third` waits for `second`. |
| `faults/main.tf` | An untouched copy of the faulty `main.tf`. The run and the test apply it first, so the failure is real. Do not edit it. |

## Steps

| # | Command | What happens |
|---|---|---|
| 1 | `node challenges/challenge-13-upgrade-and-recover/part-2-failed-apply/run.mjs` | Applies the original `main.tf` (it fails halfway), shows the state, Docker and the plan, recovers with your `main.tf`, replaces `first` on purpose with `-replace`, and walks through the stuck lock runbook. It stops after the recovery step if your `main.tf` does not recover. About 3 minutes. |
| 2 | `node --test challenges/challenge-13-upgrade-and-recover/part-2-failed-apply/test.mjs` | Fails on purpose. Each failure says what to change. |
| 3 | Edit `main.tf` | Give `second` a host port nobody else uses (8842 is free). |
| 4 | Run step 1 again, then the test | The recovery plan is `2 to add, 0 to change, 1 to destroy`. After the apply, all three containers run and `first` kept its id. |
| 5 | `node toolkit/show-facts.mjs c13.p2` | Shows the saved facts. |

If a run stopped halfway: `node toolkit/cleanup.mjs 13`.

## What you should see

The recorded run is in [results.md](results.md). In short:

1. **The failed apply:** `docker_network.net` and `docker_container.first` are created. `second` fails with `Error: Unable to start container: ... Bind for 127.0.0.1:8841 failed: port is already allocated`. Exit code 1. `third` is never tried.
2. **What it left behind:** the state lists `docker_network.net`, `docker_container.first` and `docker_container.second`. Docker has `tfc-c13-first` running, `tfc-c13-second` in status `created` (it never started) and no `tfc-c13-third`. The plan says `docker_container.second is tainted, so must be replaced` and `Plan: 2 to add, 0 to change, 1 to destroy.`
3. **Recovery:** the same plan with your `main.tf`, then `Apply complete! Resources: 2 added, 0 changed, 1 destroyed.` All three containers run. The id of `first` is the same as before the recovery.
4. **`-replace`:** `docker_container.first will be replaced, as requested`, `Plan: 1 to add, 0 to change, 1 to destroy.` and a new id for `first`. Nothing else changes.
5. **The stuck lock:** `Error: Error acquiring the state lock` with `Lock Info:` and the fields `ID`, `Path`, `Operation`, `Who`, `Version`, `Created`. After `terraform force-unlock -force <ID>` the answer is `Terraform state has been successfully unlocked!` and the next plan says `No changes.`

The lock in step 5 is made by the script: it sends the same `LOCK` request a Terraform run sends, and never sends the `UNLOCK` a killed run never sends. The ID, the name `ci-runner@build-7` and the time are made up for the demonstration. What Terraform prints about it is real.

![Containers that exist after each step](chart.svg)

## Where each number comes from

| Fact | Where it comes from |
|---|---|
| `c13.p2.failed_apply_exit_code`, `c13.p2.failed_apply_error` | Exit code and cause of the first apply. |
| `c13.p2.state_resources_after_failure_count`, `c13.p2.second_docker_status_after_failure`, `c13.p2.third_docker_status_after_failure` | `terraform state list` and `docker inspect` after the failure. |
| `c13.p2.second_tainted_in_plan`, `c13.p2.plan_after_failure_add_count`, `_destroy_count` | The plan on the partial state. |
| `c13.p2.recovery_plan_add_count`, `_destroy_count`, `c13.p2.recovery_apply_added_count`, `_destroyed_count`, `c13.p2.recovery_first_kept`, `c13.p2.recovery_all_running` | Plan and apply with your `main.tf`, then `docker inspect`. |
| `c13.p2.replace_plan_add_count`, `_destroy_count`, `c13.p2.replace_says_as_requested`, `c13.p2.replace_changed_id` | `plan -replace` and `apply -replace` on `first`. |
| `c13.p2.lock_error_title`, `c13.p2.lock_plan_exit_code`, `c13.p2.lock_error_names_holder` | The plan while the lock is held. |
| `c13.p2.force_unlock_ok`, `c13.p2.lock_held_after_force_unlock`, `c13.p2.plan_after_unlock_no_changes` | `force-unlock` and the plan after it. |

## Platform box

- **Linux and WSL2, Docker Desktop, Codespace:** the same messages. The wording after `Bind for` and the container ids differ between machines. If something else on your machine already uses port 8841 or 8842, pick two free ports and change them in `main.tf` and `faults/main.tf` (the clash needs both containers of `faults/main.tf` on the same port; the fix needs two different ports).
- **A local Terraform binary of 1.17 or newer** gives the same output. With a local binary the state server is reached at `127.0.0.1`; with the container it is `host.docker.internal`.

Related: part 1 upgrades a provider, part 3 runs the same code on OpenTofu.

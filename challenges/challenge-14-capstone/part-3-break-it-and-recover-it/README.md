# Challenge 14, part 3: break it and recover it

**Time:** about 3 hours. **Download:** none. **Safety rules:** [SAFETY.md](../../../SAFETY.md)

## The problem

It is 3 a.m. and a pipeline job was killed halfway through an apply. Now every plan says the state is locked. Or the state file on the server is gone and Terraform wants to build everything again. Or an apply stopped after the cache and before the web container. The person on call has never seen your platform.

A platform that you have never broken is a platform you do not understand. In this part you break yours three ways, on purpose, in `dev`, and you recover each time. You write the **runbook** (the page the person on call follows) from what you really saw, with the real error text.

## The idea

**A failed apply.** Terraform builds resources in order. When one fails, it stops: what it built stays built, and the state records it. Three kinds of truth now disagree: the state, Docker, and what the plan wants. Read all three before you touch anything. A resource that was created but failed to start is **tainted**: the next plan says it must be replaced, and replaces only that one. The recovery is: fix the cause, plan, apply again.

**A stuck lock.** Terraform locks the state before it reads it, so two runs cannot write at once. A run that is killed never releases the lock. The error names the lock: its ID, who took it, when. Before you remove it, check that the job it names is really dead. `terraform force-unlock` removes the lock and nothing else: it does not touch the infrastructure and does not repair a half-written state. Remove the lock of a live run and two applies write one state.

**Lost state.** The state is the only memory Terraform has. When it is gone the real containers keep running, and the plan wants to add everything again. A plan that adds what you already have means the state is lost: do not apply it. The way back is a copy of the state. `terraform state pull` prints the current state, so take a copy before every apply and keep it somewhere that is not the state server. `terraform state push` writes a copy back. A copy is only as new as the day you took it.

Why the data survived all three: the cache keeps its data on a **volume**, not in the container. A container can be replaced; the volume is a separate object, guarded in `prod` by `prevent_destroy`.

## Your task

1. **Run the experiment** (step 2). It breaks your `dev` three times and recovers each time. It prints every error text. Read the output slowly: this part is about reading.
2. **Write `capstone/RUNBOOK.md`.** The starter has three sections: `## Stuck lock`, `## Lost state`, `## Failed apply`. Each has three headings: `### Command` (what you ran), `### Error` (the real error text, pasted in a code block), `### Recovery` (what you checked, what you ran, how you know service is back). Replace every `TODO`. Paste real output, not what you think it says. The test looks for the real error lines.
3. Run the test, and commit `RUNBOOK.md`.

The lock in step 2 is made, not caused: a really killed run would depend on timing. The script sends the same `LOCK` request Terraform sends and never sends the matching `UNLOCK`, which is exactly what a killed run leaves behind. The error text, `force-unlock` and the plan afterwards are real.

## Steps

| # | Command | What happens |
|---|---|---|
| 1 | `node --test challenges/challenge-14-capstone/part-3-break-it-and-recover-it/test.mjs` | Fails on purpose. Each failure says what to change. |
| 2 | `node challenges/challenge-14-capstone/part-3-break-it-and-recover-it/run.mjs` | About 3 minutes. Breaks dev three ways, recovers each time, destroys everything. Needs part 1 finished. |
| 3 | Write `capstone/RUNBOOK.md` from what you saw | Command, Error and Recovery for each failure. |
| 4 | `node --test challenges/challenge-14-capstone/part-3-break-it-and-recover-it/test.mjs` | Passes when each failure recovered and the runbook holds the real error text. |
| 5 | `node toolkit/show-facts.mjs c14.p3` | Shows the saved numbers. |
| 6 | `git add capstone && git commit -m "Capstone part 3: the runbook"` | Keep your work. |

Add `--reference` to step 2 to run the solution. Add `--record` to write `results.md` and `chart.svg`.

## What you should see

The recorded run is in [results.md](results.md). In short:

- **Failed apply:** `Error: Unable to start container: ... Bind for 127.0.0.1:18401 failed: port is already allocated`. The state has 6 objects, Docker has the web container in status `created`, the plan says `docker_container.web is tainted, so must be replaced` and `Plan: 1 to add, 0 to change, 1 to destroy.` After you free the port, `Apply complete! Resources: 1 added, 0 changed, 1 destroyed.` The cache container is the same one, and the web container answers `HTTP 200`.
- **Stuck lock:** `Error: Error acquiring the state lock` with a `Lock Info:` block (`ID`, `Operation`, `Who`, `Version`, `Created`). `Terraform state has been successfully unlocked!` and then `No changes.`
- **Lost state:** `terraform state list` prints `No state file was found!`, the plan says `Plan: 6 to add, 0 to change, 0 to destroy.` while both containers still run, and an apply anyway stops with `Error: Unable to create network: Error response from daemon: network with name tfc-c14-dev-net already exists`. After `terraform state push -force` the plan says `No changes.`, the containers are the same ones, and the value written to the cache before the loss is still there.

## Where each number comes from

| Fact | How it is measured |
|---|---|
| `c14.p3.failed_apply_error` | The first `Error: Unable to start container` line of the failed apply (the endpoint name and id are replaced by `<name>` and `<id>`). |
| `c14.p3.failed_apply_web_status` | `docker inspect` of the web container after the failure. |
| `c14.p3.recovery_cache_kept` | The cache container id before the failure was fixed and after. |
| `c14.p3.lock_error_names_holder` | The lock error contains the `Who:` line of the lock that was made. |
| `c14.p3.lost_plan_add_count` | The `Plan:` line after the state file was deleted. |
| `c14.p3.restored_cache_value` | `valkey-cli GET` on the cache after the state was pushed back (the key was set before the loss). |

## Platform box

- **Linux, WSL2, Docker Desktop, Codespace:** works as written. The part publishes the web port 18401 on `127.0.0.1` twice on purpose (the second time it fails). It uses port 8852 for the state server.
- **Local binary or container:** the same output. The reference run used the container (`TFC_MODE=docker`). `terraform force-unlock` prints colour codes in some terminals; the run removes them.

[SAFETY.md](../../../SAFETY.md)

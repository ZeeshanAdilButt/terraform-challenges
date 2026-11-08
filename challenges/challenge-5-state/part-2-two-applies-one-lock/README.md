# Challenge 5, part 2: two applies, one lock

**Time:** about 40 minutes. **Download:** the `hashicorp/time` provider (small; first run only). **Docker:** only to run Terraform itself (no containers are created). **Safety rules:** [SAFETY.md](../../../SAFETY.md)

## The problem

Two engineers run `terraform apply` within seconds of each other. Or a pipeline and an engineer do. Both read the same state, both decide what to change, both write the state back. The last one to write wins and the other one's work vanishes from the state, while its resources still exist in the real world.

This is why shared state needs a **lock**. And the other half of the story: a CI job is killed halfway and the lock stays forever. Everybody is blocked, and the error message is the first thing you read.

## The idea

A **backend** is where Terraform keeps the state. The default is the file `terraform.tfstate` next to your code. The `http` backend keeps it on a web server instead, so a team can share it. Terraform speaks a small protocol to the server:

- `GET` and `POST` on the **state address**: read and write the state.
- `LOCK` and `UNLOCK` on the **lock address** and **unlock address**: take and release a lock.

If you set only `address`, the state is shared but **nothing is locked**. Terraform does not complain. Adding `lock_address` and `unlock_address` turns locking on.

With locking on:

- `apply` (and `plan`, `destroy`, and most commands) take the lock first. If it is held, they stop at once with `Error acquiring the state lock`, and print who holds it, since when, and the lock ID.
- `-lock-timeout=DURATION` makes Terraform keep retrying for that long instead of stopping at once.
- A stale lock (the holder died) needs `terraform force-unlock LOCK_ID`. Check first that the holder is really dead. Unlocking a live run risks two writers again.
- `-lock=false` turns locking off for one run. Do not use it in routine work.

The toolkit gives you the server: `toolkit/state-server.mjs`. `run.mjs` starts it on port 8810 inside its own process.

## The faults in the starter

| File | Fault |
|---|---|
| `backend.hcl` | Has an `address` and nothing else, so the state is shared but never locked. |

`main.tf` has one resource that takes 25 seconds to create, so a second apply has time to arrive. `faults/backend.hcl` is an untouched copy that the run uses for the "before" demonstration. Do not edit `faults/`. In `backend.hcl` the words between `@` signs (`@HOST@`, `@PORT@`, `@NAME@`) are filled in by `run.mjs`: keep them.

## Steps

| # | Command | What happens |
|---|---|---|
| 1 | `node --test challenges/challenge-5-state/part-2-two-applies-one-lock/test.mjs` | Fails on purpose. |
| 2 | Edit `backend.hcl` | Add the two addresses named in the `FIX` comment. |
| 3 | `node challenges/challenge-5-state/part-2-two-applies-one-lock/run.mjs` | Two applies with the original (both run), then with yours (one is refused, `-lock-timeout`, a stale lock, `force-unlock`). About 3 minutes. |
| 4 | `node --test challenges/challenge-5-state/part-2-two-applies-one-lock/test.mjs` | Passes when your backend locks. |
| 5 | `node toolkit/show-facts.mjs c5.p2` | Shows the saved numbers. |

In `run.mjs`, alice and bob are two checkouts (two folders) that share one state name on the server. Add `--reference` to `run.mjs`, or set `TFC_REFERENCE=1`, to run the solution.

## What you should see

1. **Original `backend.hcl`.** Alice starts an apply; Bob starts one 4 seconds later. Both print `Apply complete! Resources: 1 added`. The server saw 0 lock requests.
2. **Yours.** While Alice applies, the server holds a lock record (ID, Operation, Who, Version, Created).
3. **Bob's apply** is refused at once:

```text
Error: Error acquiring the state lock

Error message: HTTP remote state already locked:
ID=<lock id>
Lock Info:
  ID:        <lock id>
  Operation: OperationTypeApply
  Who:       <user>@<host>
  ...
```

4. **`-lock-timeout=5s`:** `Acquiring state lock. This may take a few moments...`, then the same error after the timeout.
5. **`-lock-timeout=120s`:** the same waiting line, then Bob gets the lock when Alice's apply ends, finds the resource already there, and prints `No changes.`
6. **A stale lock.** The run puts a lock on the server as if a CI job had been killed (who: `ci-runner@build-42`). `terraform plan` fails with the same error. `terraform force-unlock -force <ID>` (the ID copied from the error) prints `Terraform state has been successfully unlocked!`, and the next plan works.

The full recorded run is in [results.md](results.md).

![Seconds waited for the lock](chart.svg)

## Where each number comes from

| Fact | Where it comes from |
|---|---|
| `c5.p2.unlocked_apply_complete_count` | Applies (of 2) that printed `Apply complete! Resources: 1 added` with the original `backend.hcl`. |
| `c5.p2.unlocked_lock_requests_count` | `LOCK` requests the state server received in that phase. |
| `c5.p2.first_apply_took_lock` | Whether the server held a lock while Alice's apply ran. |
| `c5.p2.second_apply_exit_code`, `c5.p2.second_apply_lock_error`, `c5.p2.lock_error_line`, `c5.p2.lock_info_who_known` | Bob's refused apply: exit code, whether the error text appeared, the `HTTP remote state already locked:` line, whether a `Who:` line was shown. |
| `c5.p2.lock_timeout_short_exit_code`, `c5.p2.lock_timeout_short_waited_s` | The apply with `-lock-timeout=5s`: exit code and seconds from start to finish (includes the container start). |
| `c5.p2.lock_timeout_long_exit_code`, `c5.p2.lock_timeout_long_waited_s`, `c5.p2.lock_timeout_long_no_changes` | The apply with `-lock-timeout=120s`: exit code, seconds, whether it ended with `No changes`. |
| `c5.p2.first_apply_exit_code`, `c5.p2.lock_denied_count`, `c5.p2.lock_released_after_apply` | Alice's apply, how many `LOCK` requests the server refused with 423 (Terraform retries, so more than 3), and whether the lock was gone at the end. |
| `c5.p2.stale_lock_blocks_plan`, `c5.p2.force_unlock_exit_code`, `c5.p2.plan_after_force_unlock_exit_code` | The stale lock step. |

Waiting times depend on your machine (starting a container takes about a second each time). They are single measurements, not medians.

## What is different on your machine

- **Linux and WSL2, Docker Desktop, Codespace:** the same lines. In docker mode Terraform reaches the state server at `host.docker.internal`; with a local binary it uses `127.0.0.1`. The toolkit picks the right one.
- `force-unlock` prints its text with colour codes unless you pass `-no-color`; the recording strips them.
- The toolkit's teaching server does not compare the ID you give `force-unlock` with the ID of the lock: a wrong ID also unlocks. A real server (or HCP Terraform) may refuse. Always copy the ID from the error.
- The `Who:` line shows `root@<container id>` here because Terraform runs in a container; on your own binary it shows your user and host.

## Stuck?

- `The address is in use` or similar on port 8810: another copy of this part is still running. Wait for it, or press Ctrl+C in its terminal.
- Your second apply was not refused: look at `backend.hcl`. The names are `lock_address` and `unlock_address`, and they need the `/lock/@NAME@` path.
- `Failed to install provider`: another run was writing the shared plugin cache. `run.mjs` retries by itself.

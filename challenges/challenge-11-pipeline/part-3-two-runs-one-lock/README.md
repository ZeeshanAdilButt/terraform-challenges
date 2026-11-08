# Challenge 11, part 3: two runs, one lock

**Time:** about 60 minutes (the run itself takes 10 to 15 minutes). **Download:** none (`alpine:3.23` is on your machine; the Docker and time providers come from the plugin cache). **Safety rules:** [SAFETY.md](../../../SAFETY.md)

## The problem

Two engineers merge two pull requests within a minute. Two pipeline runs start. Both want to change the same Terraform state. If nothing coordinates them, each reads the old state, each changes the real world, and each writes a state that does not know about the other's work. The state and the real world now disagree, and the next plan is a surprise.

Teams then see "Error acquiring the state lock" in a pipeline log, get annoyed, and add `-lock=false` to the pipeline "to make it work". The error was the only thing standing between them and a corrupted state.

## The idea

A **state lock** is a note on the state that says "a run is working here, wait". Every Terraform command that could write state takes the lock first (the `plan` command too) and releases it at the end. A second run that finds the lock held has two choices:

- **Fail at once.** This is the default (`-lock-timeout=0s`). The error shows the lock information: the lock `ID`, the `Operation` (for example `OperationTypeApply`), who holds it (`Who`), and since when (`Created`). The pipeline fails and somebody (or a retry rule) starts it again later.
- **Wait.** `-lock-timeout=120s` tells Terraform to keep asking for up to two minutes. When the first run lets go, the second one gets the lock, and because its `plan` runs after the first run's apply, it plans against the new state and sees the real picture.

`-lock=false` is the third choice: do not ask. It is almost never right.

CI systems also have a **concurrency** setting that queues runs for you (the workflow in part 1 uses it so that a newer push cancels the older plan). A lock on the state is the second layer, and the only one that works when two different pipelines, or a person at a laptop, touch the same state.

In this part, each run is a "runner" with its own copy of the code (`runA`, `runB`), like two CI machines. Both use the same state on the teaching state server (`toolkit/state-server.mjs`, which `run.mjs` starts for you on port 8830). An apply holds the lock for about 30 seconds because the configuration contains a `time_sleep` resource: it stands in for a real deployment.

## Your task

`ci/pipeline.mjs` runs init, plan, and then applies the saved plan. It has one fault: both `plan` and `apply` get `-lock=false`.

1. Remove `-lock=false`.
2. Read the lock timeout from the environment variable `LOCK_TIMEOUT` (default `0s`) and pass it as `-lock-timeout=<value>` to both `plan` and `apply`.

## Steps

| # | Command | What happens |
|---|---|---|
| 1 | `node --test challenges/challenge-11-pipeline/part-3-two-runs-one-lock/test.mjs` | Fails on purpose. Each failure says what to change. |
| 2 | Edit `ci/pipeline.mjs` | Remove the fault and read `LOCK_TIMEOUT`. |
| 3 | `node challenges/challenge-11-pipeline/part-3-two-runs-one-lock/run.mjs` | About 10 to 15 minutes. Starts the state server on port 8830. A first run applies; when it holds the lock, a second run starts with no patience (`LOCK_TIMEOUT=0s`). Then three more overlaps where the second run waits (`LOCK_TIMEOUT=120s`). |
| 4 | `node --test challenges/challenge-11-pipeline/part-3-two-runs-one-lock/test.mjs` | Passes when the pipeline uses the lock. |
| 5 | `node toolkit/show-facts.mjs c11.p3` | Shows the saved numbers. |

Add `--reference` to step 3 to run the solution. Add `--record` to write `results.md` and `chart.svg`. If port 8830 is busy, stop whatever uses it first. Do not kill programs by name.

## What you should see

The recorded run is in [results.md](results.md), with the chart in [chart.svg](chart.svg). In short:

- **No patience:** run B fails in its `plan` step with `Error: Error acquiring the state lock`, `HTTP remote state already locked`, and a `Lock Info:` block with `Operation: OperationTypeApply`. Run A is not disturbed and finishes with exit code 0.
- **Patience:** run B has exit code 0 as well. The state server answered B's first lock request with 423 (held), and a later one with 200 (granted). The time between them is the wait. The recorded run reports the median of three waits.
- The container ends with the message of the run that applied last (run B), and every lock that was granted was released.

With the starter, run B never asks for the lock. It plans against the old state while run A is applying, so nothing makes it wait. In the starter run, B's apply then stops with `Error: Unable to create container: Error response from daemon: Conflict. The container name "/tfc-c11-p3-app" is already in use`: both runs tried to replace the same container. That was a lucky stop. A change without a name clash would simply be applied twice, and the state would record only one of them.

The waits are not a property of Terraform. They depend on how long the first apply holds the lock (30 seconds by design, plus the load of your machine).

## Where each number comes from

| Fact | How it is measured |
|---|---|
| `c11.p3.alone_apply_s` | The `[apply]` step time of a run on its own. |
| `c11.p3.fast_fail_exit_code`, `c11.p3.fast_fail_error_text`, `c11.p3.fast_fail_shows_lock_info` | Run B with `LOCK_TIMEOUT=0s`: its exit code, the `Error:` line, and the `Lock Info:` block with `OperationTypeApply`. |
| `c11.p3.fast_fail_after_s` | Seconds from the start of run B (which includes its `init`) to the first 423 the server logged. |
| `c11.p3.wait_median_s`, `c11.p3.wait_min_s`, `c11.p3.wait_max_s` | In three repetitions with `LOCK_TIMEOUT=120s`: time from the first 423 for B to the next `LOCK` answered 200, from the server log. |
| `c11.p3.waited_runs_ok_count`, `c11.p3.final_state_is_second_count` | Repetitions where both runs exited 0, and where `docker inspect` shows the message of run B. |
| `c11.p3.lock_denied_count`, `c11.p3.lock_granted_count`, `c11.p3.unlock_count` | `LOCK` requests answered 423 and 200, and `UNLOCK` requests, over the whole part. |

## Platform box

- **Linux, WSL2, Docker Desktop, Codespace:** the same output, with other times. Each runner runs Terraform in `hashicorp/terraform:1.17.1` and reaches the state server through `host.docker.internal`.
- **Local binary:** a Terraform 1.17 or newer binary on your PATH gives the same output; the runners use `127.0.0.1`.
- Lock IDs, user names, host names and timestamps differ in every run. `results.md` replaces the lock ID with `<id>`.

[SAFETY.md](../../../SAFETY.md)

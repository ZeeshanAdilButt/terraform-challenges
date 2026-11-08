# Notes for challenge 11 (pipeline)

Module 10 of the course: CI/CD for infrastructure. Headline interview question: describe a safe Terraform pipeline. Follow-ups: why apply the saved plan, and what happens when two runs overlap?

All outputs come from real runs of Terraform 1.17.1 in docker mode (`TFC_MODE=docker`) on Docker Desktop, Engine 29.9.2. Nothing was pushed to GitHub: the workflow file is shipped, never run, and the learner's own first green run is theirs.

## What each part proves

| Part | Folder | What the learner sees fail | What it proves |
|---|---|---|---|
| 1 | `part-1-plan-on-pr` | A summary that says `(no summary yet)`. Three actions named by a movable tag. A misformatted file stops at `fmt`; a typo stops at `validate`. | A plan on a pull request is five cheap-to-expensive steps and a Markdown comment. A rename of a volume shows up as two destroys. Pin actions to full commit SHAs. |
| 2 | `part-2-apply-saved-plan` | The starter apply step re-plans and applies a change nobody reviewed, ignores a moved state, and the gate passes a plan that destroys the data volume. | Apply the saved plan file. Config changes after the plan are not in it. A moved state makes the plan stale. A gate on `delete` actions stops the pipeline before apply. |
| 3 | `part-3-two-runs-one-lock` | The starter pipeline has `-lock=false`: nothing waits and nothing fails. | With a lock, the second run either fails at once with the lock information (timeout 0s) or waits (`-lock-timeout`) and then plans against the state the first run wrote. |

## Action SHAs in the reference workflow

Looked up on 2026-11-08 with `gh api repos/<owner>/<repo>/commits/<tag> -q .sha`:

| Action | Tag | SHA |
|---|---|---|
| `actions/checkout` | v7.0.1 | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| `actions/setup-node` | v7.1.0 | `949feb2413d6458794dcd2491c4babbbce0c15c1` |
| `hashicorp/setup-terraform` | v4.0.1 | `dfe3c3f87815947d99a8997f908cb6525fc44e9e` |

`setup-terraform` has the inputs `terraform_version` and `terraform_wrapper` (read from its `action.yml`); the workflow sets `terraform_wrapper: false` so the toolkit sees plain Terraform output. The workflow was not run and not linted by any workflow tool.

## Problems hit

- **Shared plugin cache.** Many builders use one cache folder through `toolkit/tf.js`. Terraform steps fail now and then with `text file busy`, `Failed to install provider from shared cache` or `... doesn't match any of the checksums recorded in the dependency lock file`. `lib/common.mjs` retries `init`, any Terraform call that prints one of these, and any pipeline step (`runNodeRetry`) with a growing pause. The committed `.terraform.lock.hcl` files (made with `terraform providers lock` for linux_amd64, linux_arm64, darwin_arm64, windows_amd64, plus the two h1 hashes the cached copy has been seen to produce) make init use the cache instead of rewriting it. A learner on their own machine does not meet the flake. No toolkit file was changed.
- **A failed `show` step used to leave a stale `plan.md`.** The reference `ci/plan.mjs` treats `show -json` like every other step: on failure it prints the output, writes a failure comment and exits 1.
- **A pipeline step does not see the environment of its parent in docker mode.** `tf()` passes only `opts.env` into the container. So the hold time in part 3 is a variable default (30 seconds), not an environment variable.
- The machine was heavily loaded by other builders during the recording. Every Terraform step takes seconds longer than on an idle laptop; the part 3 timings include that.

## Deviations from the roadmap and the dossier

- **Config change between plan and apply does not make a saved plan stale.** Only a change of the state does. The roadmap row says "stale saved plan error"; the error needs a state change (`Error: Saved plan is stale`). A code change after the plan is simply ignored by `terraform apply plan.tfplan`. Both are shown in part 2 (situations B and C).
- **Second run behind a lock.** The lock is taken by `plan` too, not only by `apply`. In part 3 the second run's `plan` waits, then plans against the new state, so it is not stale. A run that planned before the other one applied would hit the stale error of part 2 instead.
- The roadmap says "`-lock-timeout` wait time". The wait depends on how long the first apply holds the lock (30 seconds by design here, plus load), so the facts are recorded as measured medians of three, and the chapter must not present them as a property of Terraform.
- Dossier on locking: "`-lock=false` we do not recommend it": the starter shows why. See `results.md` of part 3 and the starter note in its README.

## What differs per platform

- Local mode on a GitHub runner or a laptop: the toolkit uses the `terraform` on the PATH when it is 1.17 or newer; the `docker: true` option is ignored.
- Docker mode reaches the state server through `host.docker.internal` (local mode: `127.0.0.1`). `run.mjs` picks with `hostName()`.
- The Markdown comment step (`gh pr comment`) needs a token with `pull-requests: write`; pull requests from forks get a read-only token, so the comment would fail there. Not exercised here.

## Lines to quote

Exact text, from `results.md` of each part.

Part 1:

- `**Plan: 1 to add, 0 to change, 1 to destroy.**` and `> **Warning:** this plan destroys 1 resource. A person must read it before it is applied.`
- `[3/5] terraform fmt -check -diff -recursive ... FAILED (exit 3, ...)` (the pipeline itself exits 1)
- `Error: Reference to undeclared input variable` with `An input variable with the name "db_modee" has not been declared. Did you mean "db_mode"?`

Part 2:

- `Error: Saved plan is stale` then `The given plan file can no longer be applied because the state was changed by another operation after the plan was created.`
- `gate: the plan destroys 2 resources. Blocked.` with `replace: docker_container.db` and `replace: docker_volume.data`
- `Apply complete! Resources: 1 added, 0 changed, 0 destroyed.` for the reviewed plan, with the container unchanged.

Part 3:

- `Error: Error acquiring the state lock` then `Error message: HTTP remote state already locked:` and the `Lock Info:` block (`ID`, `Path`, `Operation: OperationTypeApply`, `Who`, `Version`, `Created`, `Info`).
- Starter (`-lock=false`), run B: `[apply] FAILED (exit 1)` with `Error: Unable to create container: Error response from daemon: Conflict. The container name "/tfc-c11-p3-app" is already in use by container "<id>".`
- A run that waited shows `[plan] ok after Ns (it had to wait for the lock)`: the pipeline prints that when Terraform printed `Acquiring state lock`. In the recorded run the wait was 31 s in all three repetitions (first refused `LOCK` to the `LOCK` answered 200), with the first apply holding the lock about 41 s.

# Challenge 14, part 2: ship it through a pipeline

**Time:** about 3 hours. **Download:** none (every image is on your machine from part 1). You need the GitHub CLI (`gh`, signed in) to look up commit SHAs; the run still works without it, and says what it could not check. **Safety rules:** [SAFETY.md](../../../SAFETY.md)

## The problem

Your platform from part 1 works, on your laptop. On Friday a teammate opens a pull request called "use the newer cache image". It is one line. Two people approve it in a minute. After the merge, the cache container is destroyed and rebuilt, and the people who were using the cache lose their session data.

Nobody read the plan. Part 2 puts a **pipeline** (a script that a server runs for you on every change) between the pull request and the platform, so that the plan is made, read by a machine, and either passed or stopped before anyone clicks Merge.

## The idea

**GitHub Actions** runs a **workflow** (a YAML file in `.github/workflows/`) when something happens in your repository. Your workflow does four things:

1. **Plan on pull request.** The `pull_request` event runs `terraform plan` for `dev` and for `prod` and saves each plan to a file. Nothing is applied.
2. **A plan gate.** A small script reads the saved plan as JSON (`terraform show -json`) and fails the job when the plan would destroy or replace a resource labelled `tfc.protected = true`. You wrote one in challenge 8. A failed job turns the pull request red.
3. **Apply the saved plan on merge.** The `push` event on `main` plans again, then a second job downloads **that plan file** and applies it. It never plans on its own. So the change that was checked is the change that is applied, and a saved plan that no longer fits the state is refused (`Saved plan is stale`).
4. **One run at a time per environment.** A **concurrency group** per environment (`terraform-dev`, `terraform-prod`) makes a second run wait, so two runs never write the same state. A run that has started is never cancelled halfway.

Two more habits matter in a workflow:

- **Pin every action to a full commit SHA.** `uses: actions/checkout@v7` trusts whatever code the tag `v7` points to today, and a tag can be moved. A commit **SHA** (40 hexadecimal characters) names one snapshot of the code for ever. Write the tag as a comment after the SHA, so a person can still read the version.
- **Least privilege.** The workflow can read the repository and nothing else (`permissions: contents: read`), never uses `pull_request_target` (it hands code from a fork a token with write access), and each environment reads its own secret.

The steps themselves (format, init, validate, plan, gate, apply) are in `capstone/ci/pipeline.mjs`. It is a finished template file: do not edit it, because the checker compares it with the template's copy. Your workflow calls it, and so does the run of this part, so what you test on your machine is what GitHub runs.

## Your task

1. **The plan gate** `capstone/gate/plan-gate.mjs`. Write `isProtected` and `removesResource`, and the two checks in `main` (an errored plan, and the blocked lines). A comment at the top shows the JSON you read. Remember: read the label from `before`, the resource as it is now, never from `after`. The plan of a replacement lists `delete` and `create`, in either order.
2. **The workflow** `.github/workflows/terraform.yml`. The starter shows the shape in comments. Write the two jobs, `plan` and `apply`, each for `dev` and `prod`.
3. **The pins.** For every `uses:` line, find the commit of its tag and put it after the `@`, with the tag in a comment:

   ```sh
   gh api repos/actions/checkout/commits/v7.0.1 -q .sha
   ```

   Use these tags: `actions/checkout` v7.0.1, `actions/setup-node` v7.1.0, `hashicorp/setup-terraform` v4.0.1, `actions/upload-artifact` v7.0.2, `actions/download-artifact` v8.0.2. Never copy a SHA you did not look up: the run checks every one against GitHub, and a wrong SHA fails the test.

This part cannot run your workflow: only GitHub can. It runs the same steps locally, and the template file `.github/workflows/ci.yml` (already in the repository) runs your checks on GitHub on every push.

## Steps

| # | Command | What happens |
|---|---|---|
| 1 | `node --test challenges/challenge-14-capstone/part-2-ship-it-through-a-pipeline/test.mjs` | Fails on purpose. Each failure says what to change. |
| 2 | Edit `capstone/gate/plan-gate.mjs` and `.github/workflows/terraform.yml` | Write the gate, write the workflow, pin the actions. |
| 3 | `node challenges/challenge-14-capstone/part-2-ship-it-through-a-pipeline/run.mjs` | About 5 minutes. Checks your pins on GitHub, then runs the pipeline steps for both environments: first plans and applies, a harmless change, a change that replaces the protected cache, a change to the data volume, a stale plan, and plan and apply as two separate jobs. |
| 4 | `node --test challenges/challenge-14-capstone/part-2-ship-it-through-a-pipeline/test.mjs` | Passes when the gate blocks the right plans and the workflow is right. |
| 5 | `node toolkit/show-facts.mjs c14.p2` | Shows the saved numbers. |
| 6 | `git add capstone .github && git commit -m "Capstone part 2: the pipeline"`, then push and open a pull request | Your first green run on GitHub is yours to see. |

Add `--reference` to step 3 to run the solution. Add `--record` to write `results.md` and `chart.svg`.

## What you should see

The recorded run is in [results.md](results.md). In short:

- Every `uses:` line is `verified: the tag points to this commit`.
- The first plans say `Plan: 6 to add, 0 to change, 0 to destroy.` and the gate says `gate: ok`. The saved plans are applied.
- Memory 128 to 96 in prod: `Plan: 0 to add, 1 to change, 0 to destroy.` The gate passes it.
- A new cache image tag in prod: `Plan: 2 to add, 1 to change, 2 to destroy.` and `BLOCKED: module.service.docker_container.cache would be delete then create, and it is labelled protected.` The job exits 1, so the apply job would never start, and the cache container is the same one afterwards.
- Renaming the prod data volume: the plan step itself fails with `Error: Instance cannot be destroyed`. The gate has nothing to read. Two guards in two places: the gate guards what a plan is allowed to contain, `prevent_destroy` guards what Terraform is allowed to do.
- A plan saved, then another change applied by hand, then the saved plan applied: `Error: Saved plan is stale`.
- Plan on one fresh state server and apply on another: it works, because both states are empty. This is what your two jobs do on two GitHub runners.

With the starter, the gate lets everything through, and the three actions in the workflow name a tag instead of a SHA.

## What only GitHub can show

This part cannot prove that your workflow file is accepted by GitHub, that the plan comment or summary appears, that the artifact reaches the apply job, or that the concurrency group queues a second run. After you push, open the Actions tab and look. The teaching state server runs inside each job and is empty each time, so on GitHub every run builds the platform from nothing on the runner (which has Docker). A real pipeline keeps its state on a backend that outlives the job.

## Where each number comes from

| Fact | How it is measured |
|---|---|
| `c14.p2.uses_count`, `c14.p2.uses_pinned_count`, `c14.p2.pins_wrong_count` | The different `uses:` lines of the workflow; how many have a 40-character SHA; how many SHAs differ from `gh api` for the tag in their comment. |
| `c14.p2.baseline_dev_plan_add_count` | The `Plan:` line of the first plan step. |
| `c14.p2.protected_gate_exit_code`, `c14.p2.protected_gate_line` | The exit code of the plan step when the gate blocks, and the first `BLOCKED` line it printed. |
| `c14.p2.protected_cache_container_kept` | `docker inspect` of the cache container before and after the blocked plan. |
| `c14.p2.stale_apply_error` | The first `Error:` line of the apply step on a stale plan. |
| `c14.p2.two_jobs_apply_added_count` | `N added` of the apply on the second state server. |

## Platform box

- **Linux, WSL2, Docker Desktop, Codespace:** works as written. **Local binary or container:** the pipeline script uses your Terraform 1.17 or newer when it finds one and the pinned container otherwise; the output is the same. The reference run used the container (`TFC_MODE=docker`).
- Port 8851 is the state server of this part. The workflow starts its own state server on 8850 inside the job.

[SAFETY.md](../../../SAFETY.md)

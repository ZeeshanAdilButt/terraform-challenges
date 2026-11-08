# Challenge 11, part 2: apply the saved plan, and only the saved plan

**Time:** about 60 minutes. **Download:** none (`alpine:3.23` is on your machine; the Docker provider comes from the plugin cache). **Safety rules:** [SAFETY.md](../../../SAFETY.md)

## The problem

On Tuesday a reviewer reads a plan: "1 to add, nothing destroyed". She approves it. Between her approval and the apply step, another pull request is merged. The apply step runs `terraform apply -auto-approve`, which makes a **new** plan from the code as it is now. The new plan contains the other pull request's change, and that change destroys the database container. Nobody read that plan. It was applied.

The reviewed plan and the applied plan must be the same thing. Terraform can guarantee that. You have to ask for it.

## The idea

`terraform plan -out=plan.tfplan` saves the plan in a **plan file**. `terraform apply plan.tfplan` applies exactly that file. It does not plan again, so it asks no question: the file is the question you already answered.

Two things protect a saved plan.

1. **It only contains what was planned.** If the code changes after the plan was saved, applying the file still does only what the file says. The new code waits for its own plan and its own review.
2. **It goes stale.** A plan is made against one version of the state. If the state changes in between (somebody else applied something), Terraform refuses the old plan. Nothing is changed. The pipeline has to plan again.

A **gate** is a step that fails the pipeline when a rule is broken. A useful rule for infrastructure: "a plan that destroys anything needs a person". `terraform show -json plan.tfplan` gives the plan as JSON, so a script can check it.

## Your task

Three scripts are in `ci/`. `plan.mjs` is finished: it saves `plan.tfplan` and writes `plan.json`. Two have a fault.

1. **`ci/gate.mjs`: write `findDestroys(plan)`.** It returns one `{ address, action }` for every item of `plan.resource_changes` whose `change.actions` include `"delete"`. The action is `"replace"` when the actions also include `"create"` (a replace is a destroy followed by a create, in either order) and `"delete"` otherwise. The command line part already prints the result and exits with 1 when the list is not empty.
2. **`ci/apply.mjs`: apply the plan file.** The script has the plan file name in `planFile` but ignores it: it runs `terraform apply -auto-approve`, which plans again. Change the arguments so that Terraform applies `planFile`. A saved plan needs no `-auto-approve`.

## Steps

| # | Command | What happens |
|---|---|---|
| 1 | `node --test challenges/challenge-11-pipeline/part-2-apply-saved-plan/test.mjs` | Fails on purpose. Each failure says what to change. |
| 2 | Edit `ci/gate.mjs` and `ci/apply.mjs` | Find the destroys, apply the file. |
| 3 | `node challenges/challenge-11-pipeline/part-2-apply-saved-plan/run.mjs` | About 5 minutes. Four situations, each run through your three scripts: a plan that only adds; a change merged after the review; a state that moved after the plan; a plan that destroys the data volume. |
| 4 | `node --test challenges/challenge-11-pipeline/part-2-apply-saved-plan/test.mjs` | Passes when the gate and the apply step are right. |
| 5 | `node toolkit/show-facts.mjs c11.p2` | Shows the saved numbers. |

Add `--reference` to step 3 to run the solution. Add `--record` to write `results.md`.

## What you should see

The recorded run is in [results.md](results.md). In short:

- **A.** The gate prints `gate: the plan destroys nothing. Passed.` and exits with 0.
- **B.** The apply step applies the saved plan: `Apply complete! Resources: 1 added, 0 changed, 0 destroyed.` The change merged after the review is not applied. The container is the same container, and the next plan still shows that change as a plan of its own.
- **C.** The apply step stops with `Error: Saved plan is stale`, and the exit code is not 0.
- **D.** The gate prints `Blocked.` with `replace: docker_container.db` and `replace: docker_volume.data`, and exits with 1. The apply step is not run. The volume is still there.

With the starter, B applies the change nobody reviewed (the container is destroyed and rebuilt), C applies without complaint, and D passes the gate.

## Where each number comes from

| Fact | How it is measured |
|---|---|
| `c11.p2.gate_clean_exit_code`, `c11.p2.gate_destroy_exit_code` | Exit code of `node ci/gate.mjs` for the add-only plan and for the plan that renames the volume. |
| `c11.p2.gate_destroy_lines_count` | Lines of the form `replace: <address>` or `delete: <address>` the gate printed for the renamed volume. |
| `c11.p2.reviewed_apply_added_count`, `c11.p2.reviewed_apply_destroyed_count` | The `Apply complete!` line of the apply step in situation B. |
| `c11.p2.unreviewed_change_applied` | `docker inspect` after situation B: the container has a new id or `DB_MODE=fast`. |
| `c11.p2.pending_destroy_after_apply_count` | The destroy count of a `terraform plan` after situation B. |
| `c11.p2.stale_plan_refused`, `c11.p2.stale_error_text` | The apply step in situation C exits with an error that says `stale`. |
| `c11.p2.apply_skipped_after_gate` | The gate failed, the apply step did not run, the container id is unchanged and the data volume exists. |

## Platform box

- **Linux and WSL2, Docker Desktop, Codespace:** the same output. In docker mode, each script runs Terraform in `hashicorp/terraform:1.17.1` with the Docker socket mounted.
- **Local binary:** a Terraform 1.17 or newer binary on your PATH gives the same output.
- **In a real pipeline:** the plan file travels from the plan job to the apply job as an artifact, with a person's approval in between. Treat it as sensitive: it can hold values that are hidden in the plan text. This part runs all steps on one machine and does not simulate the approval.

[SAFETY.md](../../../SAFETY.md)

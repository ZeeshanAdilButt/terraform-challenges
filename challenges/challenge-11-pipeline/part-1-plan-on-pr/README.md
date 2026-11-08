# Challenge 11, part 1: plan on pull request

**Time:** about 60 minutes. **Download:** none (the image `alpine:3.23` is on your machine from earlier challenges; the Docker provider comes from the plugin cache). **Safety rules:** [SAFETY.md](../../../SAFETY.md)

## The problem

A teammate opens a pull request called "small tidy-up of the database settings". It has four changed lines. Two reviewers approve it in a minute, because four lines is small. After the merge, the database container is rebuilt, and with it the volume that held the data.

Nobody ran Terraform on the pull request. The reviewers read the code change. They did not read the plan: the list of what Terraform would do. A **pipeline** (a script that a server runs for you on every change) can run the plan for them and put it in front of the reviewers, before anyone clicks Merge.

## The idea

A **pull request** (PR) is a proposed change that people review before it joins the main branch. **CI** (continuous integration) means a server runs checks on every PR. For Terraform, the first check is "plan on pull request":

1. `terraform init` gets the providers.
2. `terraform validate` catches typos and wrong references. It is fast and needs no real infrastructure.
3. `terraform fmt -check` fails when a file is not formatted the standard way. This keeps diffs small.
4. `terraform plan -out=plan.tfplan` works out what would change and saves it in a **plan file**.
5. `terraform show -json plan.tfplan` turns that plan file into JSON, which a script can read.

Then the script writes a short Markdown summary, and the workflow posts it as a comment on the PR. The checks run cheapest first, so a typo fails in seconds instead of after a long plan.

**GitHub Actions** is the part of GitHub that runs workflows. A workflow is a YAML file in `.github/workflows/`. Each step can `uses:` an **action**, a ready-made step written by someone else, for example `actions/checkout`. If you write `uses: actions/checkout@v7`, you trust whatever code the tag `v7` points to today. A tag can be moved. A **commit SHA** (40 hexadecimal characters) names exactly one snapshot of the code and cannot be moved. Pin every action to a full SHA and write the tag in a comment, so a human can still read the version.

## Your task

In `ci/plan.mjs` the function `renderMarkdown(plan, { dir })` is empty. In `.github/workflows/plan.yml` the three actions are not pinned.

1. **Write `renderMarkdown`.** It receives the JSON from `terraform show -json` (an object with `resource_changes`, each with an `address` and `change.actions`). It returns Markdown with these parts, in this order:
   - a heading line: ``## Terraform plan for `infra` ``
   - a bold summary line: `**Plan: 1 to add, 0 to change, 1 to destroy.**` A replace (`["delete", "create"]`) counts once as an add and once as a destroy, the same as the line Terraform prints.
   - a table with the header `| Resource | Action |` and one row per change that does something, for example `` | `docker_container.db` | replace | ``. Leave out `no-op` and `read` changes.
   - when anything is destroyed, a last line starting with `> **Warning:**` that says how many resources are destroyed.
   - when nothing changes: the single line `**No changes.**` and no table.

   The helper `actionName(actions)` is already there. It turns `["delete", "create"]` into `replace`.
2. **Pin the actions.** Find the commit of each tag and put it after the `@`, with the tag in a comment:

   ```sh
   gh api repos/actions/checkout/commits/v7.0.1 -q .sha
   ```

   Do the same for `actions/setup-node` with the tag `v7.1.0` and `hashicorp/setup-terraform` with the tag `v4.0.1`. The tests only check that each SHA has 40 hexadecimal characters. Checking that it is the right commit is your job. That is the point of the command above.

This part ships the workflow file only. It does not run on GitHub here. When you copy it into your own repository and open a pull request, your first green run is yours to see.

## Steps

| # | Command | What happens |
|---|---|---|
| 1 | `node --test challenges/challenge-11-pipeline/part-1-plan-on-pr/test.mjs` | Fails on purpose. Each failure says what to change. |
| 2 | Edit `ci/plan.mjs` and `.github/workflows/plan.yml` | Write the summary, pin the actions. |
| 3 | `node challenges/challenge-11-pipeline/part-1-plan-on-pr/run.mjs` | About 4 minutes. Runs your pipeline step six times: a first plan, no changes, a destroying change, a change that destroys the data volume, a badly formatted file, a typo. Then it reads your workflow. |
| 4 | `node --test challenges/challenge-11-pipeline/part-1-plan-on-pr/test.mjs` | Passes when the summary and the pins are right. |
| 5 | `node toolkit/show-facts.mjs c11.p1` | Shows the saved numbers. |

Add `--reference` to step 3 to run the solution. Add `--record` to write `results.md`.

## What you should see

The recorded run is in [results.md](results.md). In short:

- The first run prints five steps, each `... ok`, and writes `plan.md` with `**Plan: 3 to add, 0 to change, 0 to destroy.**`
- After an apply, the next run writes `**No changes.**`
- One changed word (`default = "fast"`) gives `**Plan: 1 to add, 0 to change, 1 to destroy.**` and the warning line.
- Renaming the volume gives two destroys: the volume and the container that mounts it.
- A badly formatted file stops the pipeline at the `fmt` step, with exit code 1, and the comment says `Failed at the fmt step`.
- A typo in a variable name stops it at `validate`. The `fmt` and `plan` steps never run.
- The workflow lists three `uses:` lines, all pinned.

With the starter, the summary says `(no summary yet)` and the three actions are not pinned.

## Where each number comes from

| Fact | How it is measured |
|---|---|
| `c11.p1.first_plan_add_count` | The `Plan:` line of `terraform show` on the first plan file. |
| `c11.p1.md_headline_matches_terraform` | Your summary line compared with that `Plan:` line, number by number. |
| `c11.p1.replace_destroy_count`, `c11.p1.volume_replace_destroy_count` | The destroy count in your summary line after each change. |
| `c11.p1.fmt_failure_exit_code`, `c11.p1.validate_failure_exit_code` | The exit code of `node ci/plan.mjs` for the misformatted and the broken file. |
| `c11.p1.workflow_uses_count`, `c11.p1.workflow_unpinned_count` | `uses:` lines in your workflow, and how many do not end in 40 hexadecimal characters. |

## Platform box

- **Linux and WSL2, Docker Desktop, Codespace:** the same output. In docker mode, `ci/plan.mjs` runs each Terraform step in `hashicorp/terraform:1.17.1` with the Docker socket mounted.
- **Local binary:** a Terraform 1.17 or newer binary on your PATH gives the same output. On a GitHub runner there is no `TFC_MODE`, so the toolkit uses the Terraform that `setup-terraform` installed (pinned to 1.17.1 in the workflow).
- The step timings in the console output change from run to run. The recorded `results.md` replaces them with `(Ns)`.

[SAFETY.md](../../../SAFETY.md)

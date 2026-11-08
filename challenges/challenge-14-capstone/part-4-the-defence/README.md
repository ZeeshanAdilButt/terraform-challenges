# Challenge 14, part 4: the defence

**Time:** about 90 minutes. **Download:** none. No Docker needed. **Safety rules:** [SAFETY.md](../../../SAFETY.md)

## The problem

You built the platform, shipped it through a pipeline, broke it and recovered it. A reviewer who was not there has to decide whether you understand it. They will not read every line. They will look at the repository, at one green run, and at five minutes of you talking without notes.

This part is the last: you check that the pieces a reviewer looks for are there, record the five minutes, and tag the commit that is graded.

## The idea

**Who checks what.** Two things read your work, and neither one runs your code on our servers.

- **CI on GitHub.** Every push runs `.github/workflows/ci.yml`. It runs the Docker-free checks of this challenge (`capstone.test.mjs`), `terraform fmt -check`, `terraform validate` for both environments, and `terraform test` with the provider mocked. A green run on the commit you tag is the evidence that "the build and the tests pass". It is a template file: you cannot weaken it, because the checker compares it with the template's copy.
- **The checker.** It reads your public repository and that CI run: the files under `capstone/`, the pinned actions in your workflow, your tag `capstone-v1`, and your `RUNBOOK.md` and `DEFENCE.md`. A mentor then watches your recording.

**What the checklist looks at.** It checks the shape of your work, never how well you wrote it: that the module has validation and outputs and a pinned provider, that `dev` and `prod` have separate state, that the tests include a plan test, a failing-validation test and a mock test, that your gate blocks the right plans on made-up plans, that every action is pinned, that the runbook has the real error lines, that the defence has a link and an answer to each question. The seven areas match the seven criteria of the rubric: module interface, state and environments, safety gates, pipeline, break and recover, secrets and least privilege, defence.

**The defence.** Five minutes, one take, no notes. A good order: 30 seconds on what the platform is and why two environments; one minute showing the pipeline blocking a plan that would replace the protected cache; two minutes breaking one thing (a stuck lock is quick) and recovering it from the runbook; the rest on the headline question: what breaks, how do you know, how do you recover?

## Your task

1. **Write `capstone/DEFENCE.md`.** It has six questions from the course, each as a heading. Answer each in your own words, at least 40 words. Write the answers after you have practised them aloud, not before.
2. **Record the five minutes.** Put the recording where a mentor can open it without a login. Write the link on the line that starts with `Recording: `.
3. **Run the checklist.** Fix what it says is missing.
4. **Push, wait for a green CI run, and tag the commit:** `git tag capstone-v1` and `git push origin capstone-v1`. The repository must be public.

## Steps

| # | Command | What happens |
|---|---|---|
| 1 | `node --test challenges/challenge-14-capstone/part-4-the-defence/test.mjs` | Fails on purpose. Each failure says what to change. |
| 2 | Write `capstone/DEFENCE.md`, record the five minutes | Answers in your own words, and the link on the `Recording:` line. |
| 3 | `node challenges/challenge-14-capstone/part-4-the-defence/run.mjs` | About 10 seconds. Prints the checklist by rubric area and runs the same test CI runs. |
| 4 | `node --test challenges/challenge-14-capstone/part-4-the-defence/test.mjs` | Passes when the runbook, the defence and the whole checklist are complete, and parts 1 to 3 passed their last runs. |
| 5 | `node toolkit/show-facts.mjs c14.p4` | Shows the saved numbers. |
| 6 | `git add capstone && git commit -m "Capstone part 4: the defence"`, push, check the Actions tab, tag `capstone-v1` | Only GitHub can show the green run. |

Add `--reference` to step 3 to run the solution. Add `--record` to write `results.md`.

## What you should see

The recorded run is in [results.md](results.md). In short: seven lines, one per rubric area, each `ok`, then the Docker-free test of CI with every check passing and none failing. With the starter, the module, the gate, the pipeline, the runbook and the defence areas say `MISSING`, and the test names each missing piece.

## What only GitHub can show

This script never reaches GitHub, so it cannot prove that the repository is public, that your recording opens without a login, that CI is green on the commit you tag, or that the tag exists. Look at each one on github.com before you submit. A red CI run on the tagged commit means the checker finds no evidence that your tests pass.

## Where each number comes from

| Fact | How it is measured |
|---|---|
| `c14.p4.checklist_total_count`, `c14.p4.checklist_passed_count` | The checks of `shape.mjs` over your whole capstone (module, environments, tests, gate, workflow, runbook, defence). |
| `c14.p4.runbook_failing_count`, `c14.p4.defence_failing_count` | The failing checks of `RUNBOOK.md` and `DEFENCE.md`. |
| `c14.p4.ci_tests_pass_count`, `c14.p4.ci_tests_fail_count` | The `# pass` and `# fail` lines of `node --test challenges/challenge-14-capstone/capstone.test.mjs`, the test CI runs. |

## Platform box

- **All platforms:** plain Node, no Docker and no Terraform needed for this part. The CI workflow runs Terraform 1.17.1 on GitHub's `ubuntu-24.04` runner.

[SAFETY.md](../../../SAFETY.md)

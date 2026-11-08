# Challenge 9, part 3: keeping logs clean

**Time:** about 50 minutes. **Download:** none beyond parts 1 and 2. No Docker objects are created. The token is fake. **Safety rules:** [SAFETY.md](../../../SAFETY.md)

## The problem

A CI job runs `terraform plan` and `terraform apply`, and keeps everything: the console log, the plan, the state. Months later someone finds the deploy token in the build log of a job that anyone in the company can open. Nobody printed it on purpose. The variable was not marked sensitive, the plan showed it, and the log kept it.

You cannot read every log. So the build itself must check, and fail when a secret shows up.

## The idea

A **secret scanner** takes the secrets the job knows (from its own environment) and looks for them in what the job produced. If it finds one, the build fails. Three rules make it good:

| Rule | Why |
|---|---|
| Look for the secret in the forms CI tools print it | Tools encode values. A token in a URL shows up percent-encoded (`/` becomes `%2F`). A token in a header shows up as base64. A plain search for the plain text misses both. |
| Never print the secret | The scanner's own output goes into the same log. Say **where** (file, line, which secret, which form), never **what**. |
| Refuse to pass when there is nothing to look for | An empty secret is "contained" in every text, so a naive scanner either flags everything or, with a guard, finds nothing. A job with no secret configured must fail loudly, not pass quietly. |

And one rule about trust: **a check that has never failed proves nothing.** This part makes you build the scanner, then runs it on a stack that is known to leak, and only then on yours.

The pieces:

| File | Who writes it | What it does |
|---|---|---|
| `scan.mjs` | you | `findSecrets(text, secrets)`: finds each secret in each form and returns where. The starter finds nothing. |
| `ci.mjs` | given | The wrapper. `node ci.mjs --secret-env API_TOKEN <files>` reads the secret from the environment, scans each file with your `scan.mjs`, prints the findings, and exits with 1 (leak), 0 (clean) or 2 (nothing to look for, or bad use). |
| `main.tf` | you fix it | Passes a token to a deploy step. The starter leaks it into the plan, the apply log, the plan JSON and the state. |
| `fixtures/leaky/` | given | A copy of the leaky stack, so the scanner always has something to catch, whatever you do to `main.tf`. |

## Steps

| # | Command | What happens |
|---|---|---|
| 1 | `node challenges/challenge-9-secrets/part-3-clean-logs/run.mjs` | Plays the CI job on your `main.tf` and on `fixtures/leaky`. For each: plan, apply, keep the logs, search the files itself, then run `ci.mjs`. On the starter both builds are green and the files really leak: the scanner has nothing in it yet. |
| 2 | `node --test challenges/challenge-9-secrets/part-3-clean-logs/test.mjs` | Fails on purpose. |
| 3 | Write `forms` and `findSecrets` in `scan.mjs` | The comments say what to return. Three forms, a minimum length, a line number per finding. |
| 4 | `node --test challenges/challenge-9-secrets/part-3-clean-logs/test.mjs` | The scanner tests can pass now, on small made-up texts. |
| 5 | Run step 1 again | The leaky stack now fails the build (exit code 1), listing files and lines. Your `main.tf` is still leaky, so its build fails too. |
| 6 | Fix `main.tf` | Make the variable ephemeral and give it to an ephemeral resource, as in part 2. The token must reach the deploy step and no file. |
| 7 | Run step 1 again, then the test | Your build is green and the files are clean. The leaky stack still fails. All tests pass. |
| 8 | `node toolkit/show-facts.mjs c9.p3` | Shows the saved facts. |

The solution is in `reference/` (`main.tf` and `scan.mjs`). `TFC_REFERENCE=1 node challenges/challenge-9-secrets/part-3-clean-logs/run.mjs` runs it.

## What you should see

On the starter, two green builds that hide four leaking files each:

```text
what is really in each file (plain text search by run.mjs):
  logs/plan.txt      YES
  logs/plan.json     YES
  logs/apply.txt     YES
  terraform.tfstate  YES
what ci.mjs said:
  ci: ok, 4 file(s) scanned, no secret found.
```

On the reference, the leaky stack fails, with findings that say where and never what:

```text
LEAK: logs/plan.txt:11: API_TOKEN found as plain
LEAK: logs/plan.json:1: API_TOKEN found as plain
LEAK: logs/apply.txt:8: API_TOKEN found as plain
LEAK: terraform.tfstate:8: API_TOKEN found as plain
ci: build failed, 7 place(s) hold a secret.
```

and your build is clean. The exact output is in [results.md](results.md).

Why `terraform.tfstate` and `logs/plan.json` are on the list: they are what a pipeline keeps and uploads, and both hold every value that is not ephemeral, sensitive or not (part 1).

## Where each number comes from

| Fact | Where it comes from |
|---|---|
| `c9.p3.learner_build_ok`, `c9.p3.fixture_build_ok` | The build (init, plan, apply) finished for your `main.tf` and for `fixtures/leaky`. |
| `c9.p3.learner_truth_leak_places_count`, `c9.p3.fixture_truth_leak_places_count` | How many of the four kept files contain the fake token, by a plain text search in `run.mjs` (not by your scanner). |
| `c9.p3.learner_ci_exit_code`, `c9.p3.fixture_ci_exit_code` | The exit code of `ci.mjs` for each build. |
| `c9.p3.ci_prints_secret` | True if `ci.mjs` printed the token in plain, URL or base64 form. Must be false. |

## What is different on your platform

- **Linux and WSL2, Docker Desktop, Codespace:** the same. The deploy step is a command run by `sh` inside the Terraform container in docker mode, as in part 2.
- **Local binary:** the command needs `sh` and `cat` on the PATH (native Windows: use docker mode).
- **Your own CI:** `ci.mjs` is plain Node. Run it as the last step of the job, after the run output has been saved to a file, and make its exit code fail the job.

## Stuck?

- The scanner test for the URL form fails: `encodeURIComponent` writes `/` as `%2F`, `+` as `%2B` and `=` as `%3D`.
- The empty-secret test fails: `'text'.includes('')` is true. Return no forms for a secret shorter than 8 characters.
- The scanner passes the unit tests but the leaky stack stays green: `ci.mjs` imports `./scan.mjs` from `work/`. Run step 1 again so `work/` gets your latest file.
- The token is still in `terraform.tfstate`: a `resource` still takes `var.api_token`. The variable must be `ephemeral = true`, and only an ephemeral block may read it.
- The test still fails after you fixed a file: run step 1 first. The test reads the numbers of the last run.

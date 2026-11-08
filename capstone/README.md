# The capstone

This folder is your capstone: a small platform that you define, ship through a pipeline, break on purpose and recover. The checker reads this folder and the latest GitHub Actions run of your repository. It never runs your code itself: "the build passes" means the CI run on the commit you tag.

| Path | What it is | Part |
|---|---|---|
| `modules/service/` | the module: a web container and a cache container on one network | 1 |
| `envs/dev/`, `envs/prod/` | one root configuration per environment, each with its own state (`backend.hcl`) | 1 |
| `tests/` | `terraform test` files: plan tests, failing-validation tests, mock tests | 1 |
| `versions.tf` | the root of the tests (finished) | 1 |
| `gate/plan-gate.mjs` | the plan gate: fails the pipeline when a plan would remove something protected | 2 |
| `ci/pipeline.mjs` | the steps of the pipeline (template file, do not edit) | 2 |
| `../.github/workflows/terraform.yml` | your pipeline: plan on pull request, apply the saved plan on merge | 2 |
| `RUNBOOK.md` | how to recover from a stuck lock, lost state and a failed apply | 3 |
| `DEFENCE.md` | the link to your five-minute recording and your answers | 4 |

Commit your work after every part. When all four tests pass and CI is green, tag the commit `capstone-v1`.

Do not commit a `terraform.tfstate`, a password or a token. The state belongs on the state server. Credentials belong in the environment (`TF_HTTP_PASSWORD`) and in GitHub secrets.

# Challenge 9 facts

All facts are written by `run.mjs` through `setFact`. Names are `c9.p<part>.<what>_<unit>`. Values come from the reference run (`TFC_MODE=docker TFC_REFERENCE=1`, Terraform 1.17.1). Before each run every fact is reset to its "not done" value, so a stopped run never leaves numbers from an older run behind. Every secret is fake or random and is never printed.

## Part 1: find the secret

The fake value is `fake-db-password-not-real`. `found_<place>` is true when that text appears in that place.

| Fact | Reference value | Meaning and how measured |
|---|---|---|
| `c9.p1.init_ok`, `c9.p1.apply_ok` | true | Exit codes of init and apply. |
| `c9.p1.found_tfstate` | true | In `terraform.tfstate`. |
| `c9.p1.found_tfstate_backup` | true | In `terraform.tfstate.backup`, created by a second apply (`-replace=random_password.api`). |
| `c9.p1.found_show_json_state` | true | In the output of `terraform show -json`. |
| `c9.p1.found_output_human` | false | In the output of `terraform output` (it prints `<sensitive>`). |
| `c9.p1.found_output_json` | true | In the output of `terraform output -json`. |
| `c9.p1.found_plan_text` | false | In the text of `terraform plan -out=tfplan` (it prints `(sensitive value)`). |
| `c9.p1.found_show_json_plan` | true | In `terraform show -json tfplan`. |
| `c9.p1.found_app_conf` | true | In `app.conf`, the file the config writes. |
| `c9.p1.found_trace_log` | false | In the output of `TF_LOG=TRACE terraform apply -replace=local_file.app_conf`. |
| `c9.p1.generated_in_state` | true | The password `random_password` generated is in `terraform.tfstate` (read from state, searched, never printed). |
| `c9.p1.generated_in_output_json` | true | The same password is in `terraform output -json`. |
| `c9.p1.trace_lines_count` | 2174 | Lines of that TRACE output. Not stable across runs: do not quote it as a promise. |
| `c9.p1.matches_prediction_count` | 9 | How many of the nine entries of `predictions.json` equal what was found. The starter (all false) scores 3. |

## Part 2: ephemeral resources and write-only attributes

| Fact | Reference value | Meaning and how measured |
|---|---|---|
| `c9.p2.init_ok`, `c9.p2.apply_ok` | true | Exit codes of init and apply. |
| `c9.p2.command_runs_after_plan_count` | 1 | Lines in `runs.log` after `terraform plan -out=tfplan`. The command adds a line each time Terraform runs it. The starter: 0 (its input is a resource not yet created, so the command is deferred). |
| `c9.p2.command_runs_after_apply_count` | 2 | The same after `terraform apply tfplan`. The starter: 1. |
| `c9.p2.vault_file_has_secret` | true | `vault.out`, written by the command, holds a password of 16 or more characters. |
| `c9.p2.secret_in_state` | false | The password from `vault.out` is in `terraform.tfstate`. The starter: true. |
| `c9.p2.secret_in_show_json` | false | In `terraform show -json`. The starter: true. |
| `c9.p2.secret_in_plan_file` | false | In `terraform show -json` of a second saved plan. The starter: true. |
| `c9.p2.demo_ephemeral_into_resource_error` | `Invalid use of ephemeral value` | First error line of a plan that uses an ephemeral value as `local_file` content. |
| `c9.p2.write_only_attribute_count` | 0 | Attributes with `write_only` true, over resources, data sources and ephemeral resources of random, local, null, time, docker and the built-in terraform provider (`terraform providers schema -json`). |
| `c9.p2.ephemeral_resource_count` | 3 | Ephemeral resource types in those schemas: `local_command`, `random_bytes`, `random_password`. |
| `c9.p2.providers_scanned_count` | 6 | Providers in the schema (the five plus the built-in `terraform` provider). |

## Part 3: keeping logs clean

The fake token is `fake/api+token=not-a-real-secret`. The kept files are `logs/plan.txt`, `logs/plan.json`, `logs/apply.txt` and `terraform.tfstate`.

| Fact | Reference value | Meaning and how measured |
|---|---|---|
| `c9.p3.learner_build_ok`, `c9.p3.fixture_build_ok` | true | init, plan and apply finished for `main.tf` and for `fixtures/leaky`. |
| `c9.p3.learner_truth_leak_places_count` | 0 | Kept files that contain the token by a plain text search of `run.mjs`. The starter: 4. |
| `c9.p3.learner_ci_exit_code` | 0 | Exit code of `ci.mjs` for `main.tf`. The starter: 0 as well (its scanner finds nothing). |
| `c9.p3.fixture_truth_leak_places_count` | 4 | The same for `fixtures/leaky`. |
| `c9.p3.fixture_ci_exit_code` | 1 | Exit code of `ci.mjs` for the leaky stack. The starter: 0. |
| `c9.p3.ci_prints_secret` | false | `ci.mjs` printed the token, its URL form or its base64 form. |

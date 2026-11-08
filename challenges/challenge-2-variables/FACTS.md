# Facts of challenge 2

Every fact is saved by `run.mjs` through `toolkit/facts.js` into `facts.json`. Names are `c2.p<part>.<what>_<unit>`. Values come from the reference run on Windows 11, Docker Desktop (Engine 29.9.2), Node 22.22.2, runner mode `docker` (Terraform 1.17.1; provider random 3.9.1 in part 2), 2026-11-08. Nothing here uses Docker objects: Terraform runs in its own container and the configurations create no resources outside Terraform's state. The token in part 2 (`tfc-demo-token-not-real`) is made up; the password is generated per run and not saved as a fact.

## Part 1: types, validation and precedence

| Fact | Meaning | How it was measured |
|---|---|---|
| `c2.p1.replicas_type_text` | The type of `var.replicas` (`number` in the reference, `string` on the starter) | `terraform console`, `type(var.replicas)` |
| `c2.p1.missing_required_rejected` | A plan with no value for `project` fails with `No value for required variable` | Exit code and text |
| `c2.p1.bad_name_rejected` | `-var project=Bad_Name` fails with `Invalid value for variable` | Exit code and text |
| `c2.p1.replicas_too_high_rejected`, `replicas_fraction_rejected` | `replicas=9` and `replicas=2.5` fail with `Invalid value for variable` | Exit code and text |
| `c2.p1.good_values_accepted` | `-var project=daftar -var replicas=3` plans (exit 0) | Exit code |
| `c2.p1.string_converted_to_number` | `var.replicas + 1` is `4` when `replicas=3` is given as text | `terraform console` |
| `c2.p1.type_error_number_rejected`, `type_error_list_rejected` | `replicas=abc` and `ports=[80,"x"]` fail with `Invalid value for input variable` | Exit code and text |
| `c2.p1.duel<N>_<pair>_winner_text` | The label Terraform used when two sources set `greeting`; N = 1 to 7. Values in the reference: `tfvars`, `tfvars-json`, `auto-a`, `auto-b`, `var-file`, `var`, `var-file` | `terraform console`, `var.greeting`. Each source sets `greeting` to its own label |
| `c2.p1.duels_correct_count` | How many of the learner's seven predictions equal the winners (7 in the reference) | Compared with `predictions.json` |
| `c2.p1.documented_order_holds` | Adding the sources one at a time, lowest first, each new one wins | Eight console runs |
| `c2.p1.precedence_order_text` | The winners of those eight runs, joined by ` < ` (`default < env < tfvars < tfvars-json < auto-a < auto-b < var-file < var`) | Same |

The seven duels: 1 `TF_VAR_greeting` versus `terraform.tfvars`; 2 `terraform.tfvars` versus `terraform.tfvars.json`; 3 `terraform.tfvars` versus `a.auto.tfvars`; 4 `a.auto.tfvars` versus `b.auto.tfvars`; 5 `b.auto.tfvars` versus `-var-file=extra.tfvars`; 6 `-var-file` written first, then `-var`; 7 `-var` written first, then `-var-file`.

## Part 2: outputs and sensitive

| Fact | Meaning | How it was measured |
|---|---|---|
| `c2.p2.unmarked_output_rejected` | An output of a sensitive variable without `sensitive = true` fails with `Output refers to sensitive values` (separate demo folder) | Exit code and text |
| `c2.p2.apply_ok`, `c2.p2.apply_added_count` | The learner's `main.tf` applied; 2 resources added (`random_password.db`, `terraform_data.service`) | `applyCounts()` |
| `c2.p2.sensitive_outputs_count` | Outputs with `"sensitive": true` (2) | `terraform output -json` |
| `c2.p2.apply_log_redacted` | The apply text has `<sensitive>` and neither the password nor the token | Text search |
| `c2.p2.output_list_redacted` | `terraform output` shows `<sensitive>` twice and not the password | Text search |
| `c2.p2.output_named_leaks`, `output_raw_leaks`, `output_json_leaks` | `output db_password`, `output -raw db_password` and `output -json` contain the password (true) | Text search |
| `c2.p2.show_hides_password` | `terraform show` does not contain the password (true) | Text search |
| `c2.p2.show_leaks_token_in_output_attribute` | `terraform show` contains the token, in the `output` attribute of `terraform_data.service` (true) | Text search |
| `c2.p2.state_has_password`, `state_has_token` | `terraform.tfstate` contains both in clear text (true) | Text search |
| `c2.p2.state_password_count` | Times the password appears in `terraform.tfstate` (2: the resource attribute and the output) | Count |

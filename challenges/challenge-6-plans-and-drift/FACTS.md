# Facts: challenge 6

Facts are saved by `run.mjs` through `setFact` into `facts.json` (left out of the learner template). Names are `c<N>.p<M>.<what>_<unit>`. Values below are from the reference run. Ids, timestamps and random values are never stored as facts.

## Part 1: read the plan json

| Fact | Recorded value | How it is measured |
|---|---|---|
| `c6.p1.cbd_actions` | `"create,delete"` | The `actions` list of those two resources. |
| `c6.p1.classify_correct_count` | `7` | How many resources your `classify` and your `replaceReasons` got right. |
| `c6.p1.motd_replace_reasons` | `"content"` | `replace_paths` joined with `.`, and `action_reason`, of those resources. |
| `c6.p1.plan_text_add_count` | `4` | The `Plan: N to add, N to change, N to destroy` line. |
| `c6.p1.plan_text_change_count` | `1` | The `Plan: N to add, N to change, N to destroy` line. |
| `c6.p1.plan_text_destroy_count` | `4` | The `Plan: N to add, N to change, N to destroy` line. |
| `c6.p1.reasons_correct_count` | `7` | How many resources your `classify` and your `replaceReasons` got right. |
| `c6.p1.requested_replace_reason` | `"replace_by_request"` | `action_reason` of `terraform_data.same` in the plan made with `-replace`. |
| `c6.p1.resources_in_plan_count` | `7` | Entries under `resource_changes` in the plan JSON. |
| `c6.p1.truth_create_count` | `1` | The correct classification of each resource, fixed in `run.mjs` from the design of `main.tf` (checked against the JSON). |
| `c6.p1.truth_delete_count` | `1` | The correct classification of each resource, fixed in `run.mjs` from the design of `main.tf` (checked against the JSON). |
| `c6.p1.truth_none_count` | `1` | The correct classification of each resource, fixed in `run.mjs` from the design of `main.tf` (checked against the JSON). |
| `c6.p1.truth_replace_count` | `3` | The correct classification of each resource, fixed in `run.mjs` from the design of `main.tf` (checked against the JSON). |
| `c6.p1.truth_update_count` | `1` | The correct classification of each resource, fixed in `run.mjs` from the design of `main.tf` (checked against the JSON). |
| `c6.p1.web_action_reason` | `"replace_because_cannot_update"` | `replace_paths` joined with `.`, and `action_reason`, of those resources. |
| `c6.p1.web_actions` | `"delete,create"` | The `actions` list of those two resources. |
| `c6.p1.web_replace_reasons` | `"image,command"` | `replace_paths` joined with `.`, and `action_reason`, of those resources. |

## Part 2: drift and refresh only

| Fact | Recorded value | How it is measured |
|---|---|---|
| `c6.p2.drifted_addresses` | `"docker_container.app"` | What your `driftedAddresses()` returned for that JSON. |
| `c6.p2.error_line` | `"Error: Failed to read variables file"` | Exit codes of `plan -detailed-exitcode` with nothing changed and with a missing variables file, and the `Error:` line. |
| `c6.p2.exit_code_after_revert` | `0` | The plan after renaming the container back. |
| `c6.p2.exit_code_after_start` | `0` | The plan after `docker start`. |
| `c6.p2.exit_code_clean` | `0` | Exit codes of `plan -detailed-exitcode` with nothing changed and with a missing variables file, and the `Error:` line. |
| `c6.p2.exit_code_error` | `1` | Exit codes of `plan -detailed-exitcode` with nothing changed and with a missing variables file, and the `Error:` line. |
| `c6.p2.exit_code_plan_after_refresh_only_apply` | `2` | `apply -refresh-only`, the container name inside `terraform.tfstate` afterwards, and the plan after it. |
| `c6.p2.exit_code_refresh_only_plan` | `2` | The refresh-only plan and its JSON. |
| `c6.p2.exit_code_rename_plan` | `2` | The plan after `docker rename`. |
| `c6.p2.full_plan_exit_code_after_stop` | `2` | The same without `-minimal-refresh`. |
| `c6.p2.full_plan_refreshed_count` | `2` | The same without `-minimal-refresh`. |
| `c6.p2.minimal_refresh_exit_code` | `0` | `plan -minimal-refresh` after `docker stop`: exit code, number of `Refreshing state` lines, and whether it noticed (exit code 2). |
| `c6.p2.minimal_refresh_refreshed_count` | `0` | `plan -minimal-refresh` after `docker stop`: exit code, number of `Refreshing state` lines, and whether it noticed (exit code 2). |
| `c6.p2.minimal_refresh_sees_stop` | `false` | `plan -minimal-refresh` after `docker stop`: exit code, number of `Refreshing state` lines, and whether it noticed (exit code 2). |
| `c6.p2.plan_after_refresh_only_destroy_count` | `1` | `apply -refresh-only`, the container name inside `terraform.tfstate` afterwards, and the plan after it. |
| `c6.p2.refresh_only_apply_exit_code` | `0` | `apply -refresh-only`, the container name inside `terraform.tfstate` afterwards, and the plan after it. |
| `c6.p2.refresh_only_name_line` | `"~ name = \"tfc-c6-app\" -> \"tfc-c6-app-moved\""` | The refresh-only plan and its JSON. |
| `c6.p2.refresh_only_resource_changes_count` | `0` | The refresh-only plan and its JSON. |
| `c6.p2.refresh_only_resource_drift_count` | `1` | The refresh-only plan and its JSON. |
| `c6.p2.rename_plan_add_count` | `1` | The plan after `docker rename`. |
| `c6.p2.rename_plan_destroy_count` | `1` | The plan after `docker rename`. |
| `c6.p2.state_name_after_refresh_only` | `"tfc-c6-app-moved"` | `apply -refresh-only`, the container name inside `terraform.tfstate` afterwards, and the plan after it. |
| `c6.p2.state_resources_count` | `2` | Resources in `terraform.tfstate` at the end. |
| `c6.p2.verdict_changes` | `"changes"` | What your `verdict()` returned for those exit codes. |
| `c6.p2.verdict_clean` | `"clean"` | What your `verdict()` returned for those exit codes. |
| `c6.p2.verdict_error` | `"error"` | What your `verdict()` returned for those exit codes. |

## Part 3: sensitive values in plans

| Fact | Recorded value | How it is measured |
|---|---|---|
| `c6.p3.output_json_shows_random_secret` | `true` | Whether the random password appears in `terraform output` and `terraform output -json`. |
| `c6.p3.output_text_shows_random_secret` | `false` | Whether the random password appears in `terraform output` and `terraform output -json`. |
| `c6.p3.places_with_secret_count` | `6` | How many of your answers matched, how many there are (9), and how many places held a secret. |
| `c6.p3.plan_file_shows_variable_secret` | `true` | Whether the demo password appears in any entry of `plan.tfplan` after unzipping it (the zip is read with Node's `zlib`). |
| `c6.p3.plan_json_sensitive_flag_set` | `true` | In the plan JSON: `after_sensitive.input` of `terraform_data.db` is true; `after_unknown.input` of `terraform_data.api` is true. |
| `c6.p3.plan_json_shows_random_secret` | `false` | Whether each secret appears in `terraform show -json plan.tfplan`. |
| `c6.p3.plan_json_shows_variable_secret` | `true` | Whether each secret appears in `terraform show -json plan.tfplan`. |
| `c6.p3.plan_text_shows_variable_secret` | `false` | Whether the demo password appears in the text printed by `terraform plan`. |
| `c6.p3.predictions_correct_count` | `9` | How many of your answers matched, how many there are (9), and how many places held a secret. |
| `c6.p3.predictions_total_count` | `9` | How many of your answers matched, how many there are (9), and how many places held a secret. |
| `c6.p3.random_password_unknown_in_plan` | `true` | In the plan JSON: `after_sensitive.input` of `terraform_data.db` is true; `after_unknown.input` of `terraform_data.api` is true. |
| `c6.p3.show_state_text_shows_any_secret` | `true` | Whether either secret appears in the text printed by `terraform show`. |
| `c6.p3.state_file_shows_random_secret` | `true` | Whether each secret appears in `terraform.tfstate`. The random one is read from `terraform output -raw api_token`. |
| `c6.p3.state_file_shows_variable_secret` | `true` | Whether each secret appears in `terraform.tfstate`. The random one is read from `terraform output -raw api_token`. |

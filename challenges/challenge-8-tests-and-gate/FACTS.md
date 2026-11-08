# Challenge 8 facts

All facts are written by `run.mjs` through `setFact`. Names are `c8.p<part>.<what>_<unit>`. Values come from the reference run (`TFC_MODE=docker TFC_REFERENCE=1`, Terraform 1.17.1). Before each run every fact is reset to its "not done" value, so a stopped run never leaves numbers from an older run behind.

## Part 1: terraform test

| Fact | Reference value | Meaning and how measured |
|---|---|---|
| `c8.p1.init_ok` | true | Exit code of `terraform init`. |
| `c8.p1.test_block_count` | 5 | Lines that start with `run "` in `tests/main.tftest.hcl`. |
| `c8.p1.test_passed_count` | 5 | `N passed` of `Success! N passed, M failed.`. The starter: 2 passed. |
| `c8.p1.test_failed_count` | 0 | `M failed` of the same line. The starter: 2. |
| `c8.p1.file_left_after_test` | false | Whether `out/shop.conf` exists after `terraform test` (the apply run destroys it). |
| `c8.p1.mutant_failed_count` | 2 | `M failed` when `listen ${var.port};` is replaced by `listen 80;` in a copy of `main.tf`. |
| `c8.p1.mutant_caught` | true | `mutant_failed_count` is above 0. |

## Part 2: mock_provider

| Fact | Reference value | Meaning and how measured |
|---|---|---|
| `c8.p2.init_ok` | true | Exit code of `terraform init`. |
| `c8.p2.test_block_count` | 4 | Run blocks in `tests/mock.tftest.hcl`. |
| `c8.p2.test_passed_count`, `c8.p2.test_failed_count` | 4, 0 | Summary line of `terraform test` with no Docker socket mounted. The starter: 0 passed, 1 failed, 2 skipped (`Invalid index`). |
| `c8.p2.apply_without_docker_fails` | true | `terraform apply` with no Docker socket exits non-zero. (A plan of a config with nothing to refresh does not need Docker, so the step uses apply.) |
| `c8.p2.real_apply_conflict` | true | The real apply fails with `already in use` while a container named `tfc-c8-web` exists. |
| `c8.p2.real_apply_after_removal_ok` | true | The real apply works after that container is removed. |
| `c8.p2.real_ip_differs_from_mock` | true | The address Docker gave the container is not the mock's `10.0.0.5`. (The address itself is not stored: it depends on the machine.) |
| `c8.p2.destroyed_count` | 3 | `N destroyed` of the final destroy (image resource, network, container). |
| `c8.p2.leftover_count` | 0 | Docker objects still labelled `tfc.challenge=8`. |

## Part 3: plan gate

| Fact | Reference value | Meaning and how measured |
|---|---|---|
| `c8.p3.init_ok` | true | Exit code of `terraform init`. |
| `c8.p3.baseline_added_count` | 4 | `N added` of the first apply: image, network, database, web. |
| `c8.p3.gate_web_replace_exit_code` | 0 | Exit code of `gate.mjs` for the plan that replaces the web container. The starter: 0. |
| `c8.p3.gate_db_replace_exit_code` | 1 | The same for the plan that replaces the database (`-var db_name=...`). The starter: 0. |
| `c8.p3.gate_db_remove_exit_code` | 1 | The same for the plan that removes it (`-var with_db=false`). The starter: 0. |
| `c8.p3.gate_blocked_lines_count` | 2 | `BLOCKED:` lines over the three plans. |
| `c8.p3.check_warns_and_continues` | true | `plan -var web_memory_mb=200` exits 0 and prints `Check block assertion failed`. |
| `c8.p3.precondition_stops_plan` | true | `plan -var db_memory_mb=8` exits non-zero with `Resource precondition failed`. |
| `c8.p3.errored_plan_file_written` | true | `pre.tfplan` exists after that failed plan. |
| `c8.p3.errored_plan_json_errored` | true | `terraform show -json pre.tfplan` has `"errored": true`. |
| `c8.p3.errored_plan_apply_error` | `Cannot apply incomplete plan` | First error line of `terraform apply pre.tfplan`. |
| `c8.p3.policy_plugin_missing` | true | The output of `terraform plan -policies=./policies` names `tfpolicy-plugin`. |
| `c8.p3.policy_exit_code` | 0 | Exit code of that command. It is 0 although the output says `Error: Failed to connect to policy engine`. |
| `c8.p3.destroyed_count` | 4 | `N destroyed` of the final destroy. |
| `c8.p3.leftover_count` | 0 | Docker objects still labelled `tfc.challenge=8`. |

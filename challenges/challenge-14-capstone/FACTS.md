# Challenge 14 facts

All facts are written by `run.mjs` through `setFact`. Names are `c14.p<part>.<what>_<unit>` where the unit is part of the name when it has one. Values come from the reference run (`TFC_MODE=docker TFC_REFERENCE=1`, Terraform 1.17.1, `kreuzwerker/docker` 4.6.0, `valkey/valkey:8-alpine`). Before each run every fact is reset to its "not done" value, so a stopped run never leaves numbers from an older run behind.

## Part 1: define the platform

| Fact | Reference value | Meaning and how measured |
|---|---|---|
| `c14.p1.fmt_ok` | true | Exit code of `terraform fmt -check -recursive` in `capstone/` is 0. |
| `c14.p1.tests_passed_count` | 11 | Passed runs in the summary line of `terraform test` (provider mocked, no Docker). |
| `c14.p1.tests_failed_count` | 0 | Failed runs in that summary line. -1 when `terraform test` printed no summary. |
| `c14.p1.shape_failing_count` | 0 | Failing checks of `shape.mjs` for the module, the environments and the tests (0 when the platform is defined). |
| `c14.p1.validate_dev_ok` | true | `terraform validate` in `envs/dev` succeeds. |
| `c14.p1.validate_prod_ok` | true | `terraform validate` in `envs/prod` succeeds. |
| `c14.p1.bad_memory_rejected` | true | `terraform plan -var memory_mb=4096` in dev fails with the module rule. |
| `c14.p1.bad_memory_error` | `memory_mb must be between 16 and 256.` | The message line of that rule. |
| `c14.p1.apply_dev_added_count` | 6 | `N added` of the dev apply: two images, a volume, a network, two containers. |
| `c14.p1.apply_prod_added_count` | 6 | The same for prod. |
| `c14.p1.containers_count` | 4 | Containers labelled `tfc.challenge=14` after both applies. |
| `c14.p1.state_files_count` | 2 | `.json` state files on the state server (one per environment). |
| `c14.p1.local_tfstate_files_count` | 0 | `terraform.tfstate` files inside the environment folders (must be 0: the state is on the server). |
| `c14.p1.web_dev_status` | 200 | HTTP status of `http://127.0.0.1:18401` (waits up to 30 s for nginx). |
| `c14.p1.web_prod_status` | 200 | HTTP status of `http://127.0.0.1:18402`. |
| `c14.p1.web_reaches_cache` | `+PONG` | The answer of the cache to `PING`, sent from the dev web container with `nc` over the platform network. |
| `c14.p1.outputs_dev_keys_count` | 2 | Keys of `terraform output -json` in dev (`web_url`, `cache_address`). |
| `c14.p1.second_plan_dev_no_changes` | true | A plan right after the apply says `No changes.` with exit code 0 (dev). |
| `c14.p1.second_plan_prod_no_changes` | true | The same for prod. |
| `c14.p1.wrong_token_denied` | true | `terraform init` in prod with the dev token fails with `requires auth`. |
| `c14.p1.wrong_token_error` | `Error loading state: HTTP remote state endpoint requires auth` | First `Error:` line of that init. |
| `c14.p1.prod_destroy_blocked` | true | `terraform destroy` in prod fails with a `prevent_destroy` error. |
| `c14.p1.prod_destroy_error` | `Instance cannot be destroyed` | First `Error:` line of that destroy. |
| `c14.p1.prod_containers_after_blocked_destroy_count` | 2 | Prod containers still present after the refused destroy. |
| `c14.p1.destroy_dev_count` | 6 | `N destroyed` of the dev destroy. |
| `c14.p1.destroy_prod_count` | 6 | `N destroyed` of the prod destroy (after the guard is removed in the work copy). |
| `c14.p1.leftover_count` | 0 | Containers, networks and volumes still labelled `tfc.challenge=14` after cleanup. |

## Part 2: ship it through a pipeline

| Fact | Reference value | Meaning and how measured |
|---|---|---|
| `c14.p2.uses_count` | 5 | Different `uses:` lines in `.github/workflows/terraform.yml`. |
| `c14.p2.uses_pinned_count` | 5 | How many of them end in a 40-character commit SHA. |
| `c14.p2.pins_verified_count` | 5 | How many SHAs equal `gh api repos/<owner>/<repo>/commits/<tag> -q .sha` for the tag in their comment. -1 when `gh` is missing or not signed in. |
| `c14.p2.pins_wrong_count` | 0 | How many differ from GitHub. |
| `c14.p2.workflow_failing_count` | 0 | Failing workflow checks of `shape.mjs`. |
| `c14.p2.gate_failing_count` | 0 | Failing gate checks (the gate run on nine made-up plans). |
| `c14.p2.check_dev_exit_code` | 0 | Exit code of `node capstone/ci/pipeline.mjs check dev` (fmt, init, validate). |
| `c14.p2.check_prod_exit_code` | 0 | The same for prod. |
| `c14.p2.baseline_dev_plan_add_count` | 6 | `N to add` of the first plan step of dev. |
| `c14.p2.baseline_prod_plan_add_count` | 6 | The same for prod. |
| `c14.p2.baseline_gate_exit_code` | 0 | Highest exit code of the two first plan steps (the gate passes a plan that only creates). |
| `c14.p2.baseline_apply_ok` | true | Both first apply steps (saved plans) exit 0. |
| `c14.p2.harmless_plan_change_count` | 1 | Add plus change plus destroy of the plan for memory 128 to 96 in prod. |
| `c14.p2.harmless_plan_destroy_count` | 0 | The destroy count of that plan. |
| `c14.p2.harmless_gate_exit_code` | 0 | Exit code of that plan step (gate included). |
| `c14.p2.harmless_apply_ok` | true | The apply step of that saved plan exits 0. |
| `c14.p2.harmless_second_plan_no_changes` | true | A plan afterwards says `No changes.` |
| `c14.p2.protected_plan_destroy_count` | 2 | `N to destroy` of the plan for a new cache image tag in prod (the image resource and the cache container). |
| `c14.p2.protected_gate_exit_code` | 1 | Exit code of that plan step: the gate fails it. |
| `c14.p2.protected_gate_line` | `BLOCKED: module.service.docker_container.cache would be delete then create, and it is labelled protected.` | The `BLOCKED` line the gate printed. |
| `c14.p2.protected_cache_container_kept` | true | The cache container id is the same before and after the blocked plan. |
| `c14.p2.volume_plan_exit_code` | 1 | Exit code of the plan step after renaming the prod data volume. |
| `c14.p2.volume_plan_error` | `Instance cannot be destroyed` | First `Error:` line of that plan (`prevent_destroy`). |
| `c14.p2.stale_apply_exit_code` | 1 | Exit code of the apply step of a plan made before another change was applied by hand. |
| `c14.p2.stale_apply_error` | `Saved plan is stale` | First `Error:` line of that apply. |
| `c14.p2.two_jobs_plan_exit_code` | 0 | Plan step on a fresh, empty state server (the first "job"). |
| `c14.p2.two_jobs_apply_exit_code` | 0 | Apply step of that plan file on another fresh, empty state server (the second "job"). |
| `c14.p2.two_jobs_apply_added_count` | 6 | `N added` of that second apply. |
| `c14.p2.leftover_count` | 0 | Containers, networks and volumes still labelled `tfc.challenge=14` after cleanup. |

## Part 3: break it and recover it

| Fact | Reference value | Meaning and how measured |
|---|---|---|
| `c14.p3.runbook_failing_count` | 0 | Failing runbook checks when the run started (informational: the learner writes `RUNBOOK.md` after the run). |
| `c14.p3.failed_apply_exit_code` | 1 | Exit code of the apply while another container holds the web port. |
| `c14.p3.failed_apply_error` | `Unable to start container: Error response from daemon: failed to set up container networking: driver failed programming external connectivity on endpoint <name> (<id>): Bind for 127.0.0.1:18401 failed: port is already allocated` | The first `Error: Unable to start container` line (endpoint name and id replaced by `<name>` and `<id>`). |
| `c14.p3.failed_apply_state_resources_count` | 6 | Objects in the state after the failed apply (the tainted web container is one). |
| `c14.p3.failed_apply_web_status` | `created` | `docker inspect` status of the web container after the failure. |
| `c14.p3.failed_apply_cache_status` | `running` | Status of the cache container after the failure. |
| `c14.p3.failed_apply_web_tainted_in_plan` | true | The plan says `docker_container.web is tainted, so must be replaced`. |
| `c14.p3.recovery_plan_add_count` | 1 | `N to add` of the plan before the recovery. |
| `c14.p3.recovery_plan_destroy_count` | 1 | `N to destroy` of that plan. |
| `c14.p3.recovery_apply_added_count` | 1 | `N added` of the recovery apply. |
| `c14.p3.recovery_apply_destroyed_count` | 1 | `N destroyed` of the recovery apply. |
| `c14.p3.recovery_cache_kept` | true | The cache container id did not change during the failure and the recovery. |
| `c14.p3.recovery_web_status` | 200 | HTTP status of the web container after the recovery. |
| `c14.p3.lock_plan_exit_code` | 1 | Exit code of `terraform plan` while a lock is held that nobody will release. |
| `c14.p3.lock_error_title` | `Error acquiring the state lock` | The error title: `Error acquiring the state lock`. |
| `c14.p3.lock_error_names_holder` | true | The error contains the `Who:` line of the lock. |
| `c14.p3.lock_held_before_unlock` | true | The state server holds the lock before `force-unlock`. |
| `c14.p3.force_unlock_ok` | true | Exit code 0 of `terraform force-unlock -force <ID>`. |
| `c14.p3.lock_held_after_unlock` | false | The state server holds the lock after it. |
| `c14.p3.plan_after_unlock_no_changes` | true | A plan after the unlock says `No changes.` |
| `c14.p3.backup_resources_count` | 6 | Resources in the copy made with `terraform state pull`. |
| `c14.p3.lost_state_files_count` | 0 | State files on the server after the deletion (0). |
| `c14.p3.lost_plan_add_count` | 6 | `N to add` of the plan with no state. |
| `c14.p3.lost_containers_still_running_count` | 2 | Platform containers still running while the state is lost. |
| `c14.p3.lost_apply_error` | `Unable to create network: Error response from daemon: network with name tfc-c14-dev-net already exists` | First `Error:` line of an apply on the empty state. |
| `c14.p3.push_ok` | true | Exit code 0 of `terraform state push -force <copy>`. |
| `c14.p3.restored_plan_no_changes` | true | A plan after the push says `No changes.` |
| `c14.p3.restored_containers_kept` | true | Web and cache container ids are the ones from before the loss. |
| `c14.p3.restored_cache_value` | `hello` | The value `valkey-cli GET capstone` returns (set to `hello` before the loss). |
| `c14.p3.leftover_count` | 0 | Containers, networks and volumes still labelled `tfc.challenge=14` after cleanup. |

## Part 4: the defence

| Fact | Reference value | Meaning and how measured |
|---|---|---|
| `c14.p4.checklist_total_count` | 76 | Checks of `shape.mjs` over the whole capstone. |
| `c14.p4.checklist_passed_count` | 76 | How many pass. |
| `c14.p4.runbook_failing_count` | 0 | Failing `RUNBOOK.md` checks. |
| `c14.p4.defence_failing_count` | 0 | Failing `DEFENCE.md` checks. |
| `c14.p4.ci_tests_pass_count` | 76 | `# pass` of `node --test challenges/challenge-14-capstone/capstone.test.mjs` (the test CI runs). |
| `c14.p4.ci_tests_fail_count` | 0 | `# fail` of that run. |

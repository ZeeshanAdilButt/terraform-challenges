# Facts: challenge 5

Facts are saved by `run.mjs` through `setFact` into `facts.json` (left out of the learner template). Names are `c<N>.p<M>.<what>_<unit>`. Values below are from the reference run. Ids, timestamps and random values are never stored as facts.

## Part 1: state commands

| Fact | Recorded value | How it is measured |
|---|---|---|
| `c5.p1.backup_files_count` | `2` | Files named `terraform.tfstate.<number>.backup`, one per state command that changed the state. |
| `c5.p1.commands_failed_count` | `0` | Commands of `commands.txt` that ran, and commands that failed or were refused. |
| `c5.p1.commands_run_count` | `2` | Commands of `commands.txt` that ran, and commands that failed or were refused. |
| `c5.p1.legacy_file_kept` | `true` | Whether `out/legacy.txt` still exists. |
| `c5.p1.plan_after_add_count` | `0` | The plan after your commands. |
| `c5.p1.plan_after_destroy_count` | `0` | The plan after your commands. |
| `c5.p1.plan_after_no_changes` | `true` | The plan after your commands. |
| `c5.p1.plan_before_add_count` | `1` | The `Plan: N to add, ... N to destroy` line before your commands. |
| `c5.p1.plan_before_destroy_count` | `2` | The `Plan: N to add, ... N to destroy` line before your commands. |
| `c5.p1.resources_in_state_count` | `3` | Lines of `terraform state list` after last month's apply. |
| `c5.p1.state_resources_after_count` | `2` | Resources in `terraform.tfstate` at the end. |

## Part 2: two applies one lock

| Fact | Recorded value | How it is measured |
|---|---|---|
| `c5.p2.first_apply_exit_code` | `0` | Alice's apply, how many `LOCK` requests the server refused with 423 (Terraform retries, so more than 3), and whether the lock was gone at the end. |
| `c5.p2.first_apply_took_lock` | `true` | Whether the server held a lock while Alice's apply ran. |
| `c5.p2.force_unlock_exit_code` | `0` | The stale lock step. |
| `c5.p2.lock_denied_count` | `8` | Alice's apply, how many `LOCK` requests the server refused with 423 (Terraform retries, so more than 3), and whether the lock was gone at the end. |
| `c5.p2.lock_error_line` | `"Error message: HTTP remote state already locked:"` | Bob's refused apply: exit code, whether the error text appeared, the `HTTP remote state already locked:` line, whether a `Who:` line was shown. |
| `c5.p2.lock_info_who_known` | `true` | Bob's refused apply: exit code, whether the error text appeared, the `HTTP remote state already locked:` line, whether a `Who:` line was shown. |
| `c5.p2.lock_released_after_apply` | `true` | Alice's apply, how many `LOCK` requests the server refused with 423 (Terraform retries, so more than 3), and whether the lock was gone at the end. |
| `c5.p2.lock_timeout_long_exit_code` | `0` | The apply with `-lock-timeout=120s`: exit code, seconds, whether it ended with `No changes`. |
| `c5.p2.lock_timeout_long_no_changes` | `true` | The apply with `-lock-timeout=120s`: exit code, seconds, whether it ended with `No changes`. |
| `c5.p2.lock_timeout_long_waited_s` | `26.2` | The apply with `-lock-timeout=120s`: exit code, seconds, whether it ended with `No changes`. |
| `c5.p2.lock_timeout_short_exit_code` | `1` | The apply with `-lock-timeout=5s`: exit code and seconds from start to finish (includes the container start). |
| `c5.p2.lock_timeout_short_waited_s` | `10.6` | The apply with `-lock-timeout=5s`: exit code and seconds from start to finish (includes the container start). |
| `c5.p2.plan_after_force_unlock_exit_code` | `0` | The stale lock step. |
| `c5.p2.second_apply_exit_code` | `1` | Bob's refused apply: exit code, whether the error text appeared, the `HTTP remote state already locked:` line, whether a `Who:` line was shown. |
| `c5.p2.second_apply_lock_error` | `true` | Bob's refused apply: exit code, whether the error text appeared, the `HTTP remote state already locked:` line, whether a `Who:` line was shown. |
| `c5.p2.stale_lock_blocks_plan` | `true` | The stale lock step. |
| `c5.p2.unlocked_apply_complete_count` | `2` | Applies (of 2) that printed `Apply complete! Resources: 1 added` with the original `backend.hcl`. |
| `c5.p2.unlocked_lock_requests_count` | `0` | `LOCK` requests the state server received in that phase. |

## Part 3: lost state and restore

| Fact | Recorded value | How it is measured |
|---|---|---|
| `c5.p3.apply_conflict_error` | `"Conflict. The container name \"/tfc-c5-app\" is already in use by container \"<id>\". You have to remove (or rename) that container to be able to reuse that name."` | The apply with no state: exit code and the Docker sentence (the container id replaced by `<id>`). |
| `c5.p3.apply_lost_exit_code` | `1` | The apply with no state: exit code and the Docker sentence (the container id replaced by `<id>`). |
| `c5.p3.backup_has_container_after_first_failed_apply` | `true` | Whether `terraform.tfstate.backup` still holds `docker_container.app` after the failed apply, and after the apply with `-replace`. |
| `c5.p3.backup_has_container_after_replace_apply` | `false` | Whether `terraform.tfstate.backup` still holds `docker_container.app` after the failed apply, and after the apply with `-replace`. |
| `c5.p3.backup_resources_before_count` | `1` | Resources inside `terraform.tfstate` and `terraform.tfstate.backup` after day 2. |
| `c5.p3.container_survives_loss` | `true` | Lines of `terraform state list` after the delete, and whether `docker ps` still shows the container. |
| `c5.p3.import_container_id_unchanged` | `true` | After the apply following the import. |
| `c5.p3.import_exit_code` | `0` | Recovery B: the import and the plan after it (`forces replacement` lines counted). |
| `c5.p3.import_final_no_changes` | `true` | After the apply following the import. |
| `c5.p3.import_plan_add_count` | `1` | Recovery B: the import and the plan after it (`forces replacement` lines counted). |
| `c5.p3.import_plan_change_count` | `1` | Recovery B: the import and the plan after it (`forces replacement` lines counted). |
| `c5.p3.import_plan_destroy_count` | `0` | Recovery B: the import and the plan after it (`forces replacement` lines counted). |
| `c5.p3.import_plan_forces_replacement_count` | `0` | Recovery B: the import and the plan after it (`forces replacement` lines counted). |
| `c5.p3.leftover_count` | `0` | Docker objects still labelled `tfc.challenge=5` after cleanup. Must be 0. |
| `c5.p3.plan_lost_add_count` | `2` | The `Plan:` line with no state. |
| `c5.p3.plan_lost_destroy_count` | `0` | The `Plan:` line with no state. |
| `c5.p3.restore_container_id_unchanged` | `true` | Recovery A: the plan after the restore, whether the final plan says No changes, and whether `docker inspect` gives the same container id as before. |
| `c5.p3.restore_final_no_changes` | `true` | Recovery A: the plan after the restore, whether the final plan says No changes, and whether `docker inspect` gives the same container id as before. |
| `c5.p3.restore_plan_add_count` | `1` | Recovery A: the plan after the restore, whether the final plan says No changes, and whether `docker inspect` gives the same container id as before. |
| `c5.p3.restore_plan_destroy_count` | `0` | Recovery A: the plan after the restore, whether the final plan says No changes, and whether `docker inspect` gives the same container id as before. |
| `c5.p3.state_list_after_loss_count` | `0` | Lines of `terraform state list` after the delete, and whether `docker ps` still shows the container. |
| `c5.p3.state_resources_before_count` | `2` | Resources inside `terraform.tfstate` and `terraform.tfstate.backup` after day 2. |

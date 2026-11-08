# Facts: challenge 4

Facts are saved by `run.mjs` through `setFact` into `facts.json` (left out of the learner template). Names are `c<N>.p<M>.<what>_<unit>`. Values below are from the reference run. Ids, timestamps and random values are never stored as facts.

## Part 1: the lock file

| Fact | Recorded value | How it is measured |
|---|---|---|
| `c4.p1.gitignore_ignores_lock` | `false` | Whether a line of `team.gitignore` is exactly `.terraform.lock.hcl`. |
| `c4.p1.init_old_lock_exit_code` | `1` | Whether `init` failed with the old lock and your constraint, its exit code, and the error sentence (spaces joined into one line). |
| `c4.p1.init_refused_old_lock` | `true` | Whether `init` failed with the old lock and your constraint, its exit code, and the error sentence (spaces joined into one line). |
| `c4.p1.lock_constraint` | `"~> 2.9"` | The `version` and `constraints` lines in the lock file after the first `init` (`none` when there is no constraints line). |
| `c4.p1.lock_h1_hash_after_providers_lock_count` | `3` | Count of `"h1:` lines after `providers lock`. One per platform. |
| `c4.p1.lock_h1_hash_count` | `1` | Count of `"h1:` and `"zh:` lines in that lock file. |
| `c4.p1.lock_zh_hash_count` | `13` | Count of `"h1:` and `"zh:` lines in that lock file. |
| `c4.p1.locked_version` | `"2.9.1"` | The `version` and `constraints` lines in the lock file after the first `init` (`none` when there is no constraints line). |
| `c4.p1.old_lock_version` | `"2.8.0"` | The version the `= 2.8.0` copy locked. |
| `c4.p1.platforms_count` | `3` | Lines of `platforms.txt` that are not comments. |
| `c4.p1.refusal_line` | `"locked provider registry.terraform.io/hashicorp/local 2.8.0 does not match configured version constraint ~> 2.9; must use terraform init -upgrade to allow selection of new versions"` | Whether `init` failed with the old lock and your constraint, its exit code, and the error sentence (spaces joined into one line). |
| `c4.p1.upgrade_moved_version` | `true` | The version in the lock file after `init -upgrade`, and whether it changed. |
| `c4.p1.upgrade_version` | `"2.9.1"` | The version in the lock file after `init -upgrade`, and whether it changed. |

## Part 2: the graph and order

| Fact | Recorded value | How it is measured |
|---|---|---|
| `c4.p2.cycle_error_line` | `"Cycle:   terraform_data.a   terraform_data.b"` | `terraform validate` in `cycle/`, and its `Cycle:` line with the object names joined on one line. |
| `c4.p2.cycle_validate_exit_code` | `1` | `terraform validate` in `cycle/`, and its `Cycle:` line with the object names joined on one line. |
| `c4.p2.destroy_reverses_order` | `true` | For every link, `A` was destroyed before `B` started to be destroyed. |
| `c4.p2.edge_count` | `2` | Lines of `terraform graph` output that look like `"A" -> "B"`, for the original and for yours. |
| `c4.p2.edges_respected` | `true` | For every link "A needs B" in your graph, `B` completed before `A` started, in the apply output. |
| `c4.p2.fault_edge_count` | `1` | Lines of `terraform graph` output that look like `"A" -> "B"`, for the original and for yours. |
| `c4.p2.fault_migrate_before_database` | `true` | In the original apply, whether the `migrate` completion line comes before the `database_ready` completion line. |
| `c4.p2.fault_migrate_needs_database_edge` | `false` | Whether one of those links is `terraform_data.migrate -> time_sleep.database_ready`. |
| `c4.p2.migrate_after_database` | `true` | In your apply, whether `migrate: Creating...` comes after `database_ready: Creation complete`. |
| `c4.p2.migrate_needs_database_edge` | `true` | Whether one of those links is `terraform_data.migrate -> time_sleep.database_ready`. |
| `c4.p2.reads_apply_exit_code` | `0` | `plan` and `apply` on your `reads/`, and whether the output holds the settings that were written. |
| `c4.p2.reads_fault_error_line` | `"open ./out/settings.txt: no such file or directory"` | `terraform plan` on the original `reads/`: exit code (1) and the `Original Error:` text. |
| `c4.p2.reads_fault_plan_exit_code` | `1` | `terraform plan` on the original `reads/`: exit code (1) and the `Original Error:` text. |
| `c4.p2.reads_plan_exit_code` | `0` | `plan` and `apply` on your `reads/`, and whether the output holds the settings that were written. |
| `c4.p2.reads_value_read` | `true` | `plan` and `apply` on your `reads/`, and whether the output holds the settings that were written. |

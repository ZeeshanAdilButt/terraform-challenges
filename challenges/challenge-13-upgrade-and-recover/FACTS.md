# Facts of challenge 13

Names are `c13.p<part>.<what>_<unit>`. The values are from the recorded reference run (`TFC_MODE=docker`, Terraform 1.17.1, OpenTofu 1.13.9, and Terraform 1.16.7 where named). Plan and apply counts come from the `Plan:` and `Apply complete!` lines, versions from the lock files and state files, container facts from `docker inspect`. Ids, times and random names are never stored as facts.

| Fact | Meaning and how it was measured | Reference value |
|---|---|---|
| `c13.p1.deprecation_warning_text` | Summary of the warnings after the upgrade. | "Attribute Deprecated" |
| `c13.p1.loose_init_keeps_random_version` | After loosening the constraint to ">= 3.1", a plain init leaves the locked random version unchanged. | true |
| `c13.p1.new_local_version` | Same for local with "~> 2.9". | "2.9.1" |
| `c13.p1.new_random_version` | random version in the lock file after init -upgrade with "~> 3.9" (original code). | "3.9.1" |
| `c13.p1.old_code_warnings_count` | Warnings of terraform validate -json on the old code and old versions. | 0 |
| `c13.p1.old_local_version` | Same for hashicorp/local. | "2.1.0" |
| `c13.p1.old_random_version` | Version of hashicorp/random in the lock file after the old code was applied. | "3.1.3" |
| `c13.p1.older_terraform_applied_on_newer_state` | 1.16.7 applied without error on the state 1.17.1 wrote. | true |
| `c13.p1.original_code_plan_no_changes_after_upgrade` | The plan of the original code after the upgrade says "No changes." | true |
| `c13.p1.original_code_warnings_after_upgrade_count` | Warnings of validate on the ORIGINAL code after the upgrade. | 2 |
| `c13.p1.plain_init_refuses_new_constraint` | A plain init with constraint "~> 3.9" on a lock file at 3.1.3 fails with "does not match configured version constraint". | true |
| `c13.p1.state_version_after_new_apply` | terraform_version in terraform.tfstate after an apply with 1.17.1. | "1.17.1" |
| `c13.p1.state_version_after_old_apply` | Same after an apply with 1.16.7 on that state. | "1.16.7" |
| `c13.p1.terraform_new_init_names_version` | Same for 1.17.1. | true |
| `c13.p1.terraform_new_plan_no_changes` | Same with 1.17.1. | true |
| `c13.p1.terraform_new_version_json_has_format_version` | Same for 1.17.1. | true |
| `c13.p1.terraform_new_version_line` | Same for 1.17.1. | "Terraform v1.17.1" |
| `c13.p1.terraform_old_init_names_version` | init of 1.16.7 prints "Reusing version X of ..." (with the version) instead of "Reusing previous version of ...". | false |
| `c13.p1.terraform_old_plan_no_changes` | Plan of the same folder with 1.16.7 says "No changes." | true |
| `c13.p1.terraform_old_version_json_has_format_version` | terraform version -json of 1.16.7 contains "format_version". | false |
| `c13.p1.terraform_old_version_line` | First line of terraform version, release 1.16.7 (container). | "Terraform v1.16.7" |
| `c13.p1.your_plan_add_count` | Adds in the plan of the learner files after the upgrade. | 0 |
| `c13.p1.your_plan_change_count` | Changes in that plan. | 0 |
| `c13.p1.your_plan_destroy_count` | Destroys in that plan. | 0 |
| `c13.p1.your_random_constraint` | Constraint recorded for random in that lock file. | "~> 3.9" |
| `c13.p1.your_random_version` | random version in the lock file after init -upgrade with the learner versions.tf. | "3.9.1" |
| `c13.p1.your_warnings_count` | Warnings of validate on the learner files after the upgrade. | 0 |
| `c13.p2.failed_apply_error` | Cause of that failure. | "port is already allocated" |
| `c13.p2.failed_apply_exit_code` | Exit code of the apply of the original main.tf. | 1 |
| `c13.p2.force_unlock_ok` | terraform force-unlock -force <ID> exits 0. | true |
| `c13.p2.lock_error_names_holder` | The error shows the Who field of the lock. | true |
| `c13.p2.lock_error_title` | Title of the error while the lock is held. | "Error acquiring the state lock" |
| `c13.p2.lock_held_after_force_unlock` | The state server still holds the lock afterwards. | false |
| `c13.p2.lock_plan_exit_code` | Exit code of terraform plan while the lock is held. | 1 |
| `c13.p2.plan_after_failure_add_count` | Adds in the plan on the partial state. | 2 |
| `c13.p2.plan_after_failure_destroy_count` | Destroys in that plan. | 1 |
| `c13.p2.plan_after_unlock_no_changes` | The plan after the unlock says "No changes." | true |
| `c13.p2.recovery_all_running` | All three containers have status running after the recovery. | true |
| `c13.p2.recovery_apply_added_count` | Added, from the recovery apply. | 2 |
| `c13.p2.recovery_apply_destroyed_count` | Destroyed, same line. | 1 |
| `c13.p2.recovery_first_kept` | The container "first" has the same id before and after the recovery. | true |
| `c13.p2.recovery_plan_add_count` | Adds in the plan with the learner main.tf on the partial state. | 2 |
| `c13.p2.recovery_plan_destroy_count` | Destroys in that plan. | 1 |
| `c13.p2.replace_changed_id` | "first" has a new id after apply -replace. | true |
| `c13.p2.replace_plan_add_count` | Adds in plan -replace=docker_container.first. | 1 |
| `c13.p2.replace_plan_destroy_count` | Destroys in that plan. | 1 |
| `c13.p2.replace_says_as_requested` | The plan says "will be replaced, as requested". | true |
| `c13.p2.second_docker_status_after_failure` | docker inspect status of tfc-c13-second after the failure. | "created" |
| `c13.p2.second_tainted_in_plan` | The plan says "docker_container.second is tainted, so must be replaced". | true |
| `c13.p2.state_resources_after_failure_count` | Lines of terraform state list after the failure. | 3 |
| `c13.p2.third_docker_status_after_failure` | Same for tfc-c13-third (never created). | "does not exist" |
| `c13.p3.both_second_plans_empty` | Both second plans say "No changes." | true |
| `c13.p3.encrypted_state_name_occurrences_count` | Same in the encrypted state file. | 0 |
| `c13.p3.lock_hashes_identical` | The h1: hashes of the two lock files are identical. | false |
| `c13.p3.plain_state_name_occurrences_count` | Times "random_pet" appears in a plain OpenTofu state file. | 2 |
| `c13.p3.same_random_version_in_both_locks` | Both lock files record the same random version. | true |
| `c13.p3.state_is_encrypted` | The state file contains "encrypted_data". | true |
| `c13.p3.state_version_after_tofu_apply` | terraform_version in the state after tofu apply. | "1.13.9" |
| `c13.p3.terraform_apply_added_count` | Added, from terraform apply of the common code. | 4 |
| `c13.p3.terraform_encrypted_state_error` | Error summary of that command. | "Unsupported state file format" |
| `c13.p3.terraform_encrypted_state_exit_code` | Exit code of terraform plan on the encrypted state. | 1 |
| `c13.p3.terraform_exclude_error` | What terraform plan -exclude=... says. | "flag provided but not defined: -exclude" |
| `c13.p3.terraform_exclude_exit_code` | Exit code of that command. | 1 |
| `c13.p3.terraform_lock_registry` | Registry named in the lock file written by terraform init. | "registry.terraform.io" |
| `c13.p3.terraform_plan_after_init_upgrade_no_changes` | terraform plan after terraform init -upgrade says "No changes." | true |
| `c13.p3.terraform_plan_after_tofu_error` | What terraform plan says after tofu applied, without a new init. | "Inconsistent dependency lock file" |
| `c13.p3.terraform_reads_encrypted_state` | terraform plan on the encrypted state exits 0. | false |
| `c13.p3.terraform_version_line` | First line of terraform version. | "Terraform v1.17.1" |
| `c13.p3.tofu_apply_added_count` | Added, from tofu apply of the common code. | 4 |
| `c13.p3.tofu_exclude_plan_add_count` | Adds in tofu plan -exclude=local_file.greeting. | 3 |
| `c13.p3.tofu_lock_registry` | Registry named in the lock file written by tofu init. | "registry.opentofu.org" |
| `c13.p3.tofu_plain_plan_add_count` | Adds in tofu plan on an empty state. | 4 |
| `c13.p3.tofu_plan_on_encrypted_state_no_changes` | tofu plan on the encrypted state says "No changes." | true |
| `c13.p3.tofu_plan_on_terraform_state_no_changes` | tofu plan on a state that Terraform wrote says "No changes." | true |
| `c13.p3.tofu_rewrites_lock_registry` | tofu init on a Terraform lock file prints "registry.terraform.io/hashicorp/local => registry.opentofu.org/hashicorp/local". | true |
| `c13.p3.tofu_version_line` | First line of tofu version. | "OpenTofu v1.13.9" |
| `c13.p3.tofu_without_key_error` | Error of tofu plan on the encrypted state without the encryption block. | "other" |

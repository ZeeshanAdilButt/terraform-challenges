# Facts of challenge 12

Names are `c12.p<part>.<what>_<unit>`. The values are from the recorded reference run (`TFC_MODE=docker`, Terraform 1.17.1). Counts of plan lines come from the `Plan:` and `Apply complete!` lines; container ids and start times from `docker inspect`. Ids and random values are never stored as facts.

| Fact | Meaning and how it was measured | Reference value |
|---|---|---|
| `c12.p1.apply_added_count` | Added, same line. | 0 |
| `c12.p1.apply_changed_count` | Changed, same line. | 2 |
| `c12.p1.apply_destroyed_count` | Destroyed, same line. | 0 |
| `c12.p1.apply_imported_count` | Imported, from the "Apply complete!" line. | 3 |
| `c12.p1.container_ids_kept_count` | Containers (of 2) that kept their full id across the apply (docker inspect). | 2 |
| `c12.p1.container_restarts_count` | Containers (of 2) whose StartedAt changed across the apply. | 0 |
| `c12.p1.draft_plan_add_count` | Adds in that plan. | 2 |
| `c12.p1.draft_plan_destroy_count` | Destroys in that plan (both containers are replaced). | 2 |
| `c12.p1.draft_plan_import_count` | Imports in the plan for the untouched generated draft. | 3 |
| `c12.p1.generated_lines_count` | Non-empty lines of generated.tf written by plan -generate-config-out for 3 objects. | 146 |
| `c12.p1.generated_null_arguments_count` | Lines of generated.tf that end in "= null". | 41 |
| `c12.p1.import_by_name_error` | Error title when a container import block uses the container name as id. Taken from the plan output. | "Cannot import non-existent remote object" |
| `c12.p1.naive_forces_replacement_count` | Lines of that plan that end in "# forces replacement". | 8 |
| `c12.p1.naive_plan_add_count` | Adds in the plan for the naive configuration (labels, networks_advanced, no env). | 2 |
| `c12.p1.naive_plan_destroy_count` | Destroys in that plan. | 2 |
| `c12.p1.plan_add_count` | Adds in that plan. | 0 |
| `c12.p1.plan_change_count` | In-place changes in that plan (the provider filling in state-only arguments). | 2 |
| `c12.p1.plan_destroy_count` | Destroys in that plan. | 0 |
| `c12.p1.plan_import_count` | Imports in the plan for the learner files. | 3 |
| `c12.p1.second_plan_no_changes` | The plan after the apply says "No changes." | true |
| `c12.p1.state_resources_count` | Lines of terraform state list after the apply. | 3 |
| `c12.p2.apply_added_count` | Added, from the apply of the moves. | 0 |
| `c12.p2.apply_changed_count` | Changed, same line. | 0 |
| `c12.p2.apply_destroyed_count` | Destroyed, same line. | 0 |
| `c12.p2.container_ids_kept_count` | Containers (of 2) that kept their id across the refactor. | 2 |
| `c12.p2.container_restarts_count` | Containers (of 2) whose StartedAt changed. | 0 |
| `c12.p2.no_moved_plan_add_count` | Adds in the plan for the refactored code with moves.tf set aside. | 3 |
| `c12.p2.no_moved_plan_destroy_count` | Destroys in that plan. | 3 |
| `c12.p2.plan_add_count` | Adds in the plan with the learner moves.tf. | 0 |
| `c12.p2.plan_change_count` | Changes in that plan. | 0 |
| `c12.p2.plan_destroy_count` | Destroys in that plan. | 0 |
| `c12.p2.plan_moved_count` | Lines "has moved to" or "(moved from" in that plan. | 3 |
| `c12.p2.plan_without_moves_after_apply_no_changes` | Plan with moves.tf taken away after the apply says "No changes." (same state). | true |
| `c12.p2.second_plan_no_changes` | Plan after the apply says "No changes." | true |
| `c12.p2.state_module_resources_count` | Lines of terraform state list that start with module.app. | 3 |
| `c12.p2.teammate_apply_containers_left_count` | Containers still labelled tfc.challenge=12 after that copy applies. | 0 |
| `c12.p2.teammate_apply_error` | The cause of the error that apply ends with. | "network with name tfc-c12-net already exists" |
| `c12.p2.teammate_plan_add_count` | Adds in the plan of a copy with the old state and no moved blocks. | 3 |
| `c12.p2.teammate_plan_destroy_count` | Destroys in that plan. | 3 |
| `c12.p3.after_state_rm_plan_no_changes` | Plan after the web block is deleted too says "No changes." | true |
| `c12.p3.apply_destroyed_count` | Destroyed, from the "Apply complete!" line. | 0 |
| `c12.p3.cache_in_state` | terraform state list still lists docker_container.cache. | false |
| `c12.p3.cache_same_id` | The cache container has the same id and StartedAt as before. | true |
| `c12.p3.cache_still_running` | docker inspect says the cache container still runs after the apply. | true |
| `c12.p3.containers_running_at_end_count` | Labelled containers still running at the end of the run. | 2 |
| `c12.p3.no_removed_plan_destroy_count` | Destroys in the plan with the cache block deleted and no removed block. | 1 |
| `c12.p3.plan_add_count` | Adds in the plan with the learner removed.tf. | 0 |
| `c12.p3.plan_change_count` | Changes in that plan. | 0 |
| `c12.p3.plan_destroy_count` | Destroys in that plan. | 0 |
| `c12.p3.plan_forgotten_count` | Objects the plan says "will no longer be managed by Terraform, but will not be destroyed". | 1 |
| `c12.p3.removed_without_lifecycle_plan_destroy_count` | Destroys with removed { from = ... } and no lifecycle block. | 1 |
| `c12.p3.second_plan_no_changes` | Plan after the apply says "No changes." | true |
| `c12.p3.state_resources_count` | Lines of terraform state list after the apply. | 2 |
| `c12.p3.state_rm_apply_error` | The cause of the error of the apply after that state rm. | "container name is already in use" |
| `c12.p3.state_rm_apply_ok` | That apply succeeded. | false |
| `c12.p3.state_rm_plan_add_count` | Adds in the plan after state rm of the web container with its block still in the code. | 1 |

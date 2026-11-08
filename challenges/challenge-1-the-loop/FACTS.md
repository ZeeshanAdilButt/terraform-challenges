# Facts of challenge 1

Every fact is saved by `run.mjs` through `toolkit/facts.js` into `facts.json`. Names are `c1.p<part>.<what>_<unit>`. Values come from the reference run on Windows 11, Docker Desktop (Engine 29.9.2), Node 22.22.2, runner mode `docker` (Terraform 1.17.1; providers docker 4.6.0, random 3.9.1, local 2.9.1), 2026-11-08. No timings are saved. Random pet names, ids and container ids are never facts.

## Part 1: first plan and apply

| Fact | Meaning | How it was measured |
|---|---|---|
| `c1.p1.plan1_add_count`, `plan1_change_count`, `plan1_destroy_count` | The three numbers of the first plan (4, 0, 0) | `planCounts()` on `terraform plan` |
| `c1.p1.apply_added_count` | `added` on the first `Apply complete!` (4) | `applyCounts()` |
| `c1.p1.container_named_tfc` | The container's name starts with `/tfc-c1-` | `docker inspect` of the id read from `terraform show -json` |
| `c1.p1.container_labelled` | The container has label `tfc.challenge=1` | `docker inspect` `.Config.Labels` |
| `c1.p1.container_running` | The container is running after apply | `docker inspect` `.State.Running` |
| `c1.p1.plan2_no_changes` | The second plan printed `No changes. Your infrastructure matches the configuration.` | Text match |
| `c1.p1.plan2_add_count`, `plan2_change_count`, `plan2_destroy_count` | Numbers on the second plan's `Plan:` line (0 when it says No changes; 1, 1, 1 on the starter) | `planCounts()` |
| `c1.p1.state_resource_count` | Lines of `terraform state list` (4) | Line count |
| `c1.p1.destroy_destroyed_count` | `destroyed` on `Destroy complete!` (4) | Regular expression |
| `c1.p1.leftover_after_destroy_count` | Containers, networks and volumes labelled `tfc.challenge=1` after destroy and before the label sweep (0) | `leftovers(1)` |
| `c1.p1.alpine_image_kept` | `alpine:3.23` is still on the machine after destroy | `docker image inspect` |

## Part 2: predict three plans

Edits: 1 container `restart` `"no"` to `"on-failure"`; 2 greeting text `hello from` to `hi from`; 3 `random_pet` `length` 2 to 3; 4 container `command` `sleep 3600` to `sleep 7200` (applied, not predicted).

| Fact | Meaning | How it was measured |
|---|---|---|
| `c1.p2.baseline_added_count` | Baseline apply (4) | `applyCounts()` |
| `c1.p2.edit<N>_add_count`, `_change_count`, `_destroy_count` | The plan numbers for edit N, N = 1, 2, 3 (0/1/0, 1/0/1, 2/0/2) | `planCounts()` of a plan only; `main.tf` is restored after each |
| `c1.p2.edit<N>_touched_count` | Resource addresses in that plan (1, 1, 2) | Count of `# address will be ...` and `must be ...` lines |
| `c1.p2.edit<N>_prediction_matches` | The learner's three numbers and address list equal the real ones | Compared with `predictions.json` |
| `c1.p2.predictions_correct_count` | How many of the three match (3 in the reference) | Count |
| `c1.p2.update_apply_changed_count` | `changed` when edit 1 is applied (1) | `applyCounts()` |
| `c1.p2.update_keeps_container_id` | The container id is the same before and after edit 1 | `docker inspect` `.Id` |
| `c1.p2.replace_apply_added_count`, `replace_apply_destroyed_count` | `added` and `destroyed` when edit 4 is applied (1, 1) | `applyCounts()` |
| `c1.p2.replace_new_container_id` | The container id differs after edit 4 | `docker inspect` `.Id` |
| `c1.p2.edit4_destroy_count` | `to destroy` in edit 4's plan (1) | `planCounts()` of the apply text |
| `c1.p2.destroy_destroyed_count` | Final `terraform destroy` (4) | Regular expression |

## Part 3: destroy and what is left

| Fact | Meaning | How it was measured |
|---|---|---|
| `c1.p3.apply_added_count`, `destroy_destroyed_count` | Three image names applied and destroyed (3, 3) | `applyCounts()` and the `Destroy complete!` line |
| `c1.p3.alpine_present_after` | `alpine:3.23` exists after destroy (true) | `docker image inspect` |
| `c1.p3.alpine_id_unchanged` | Its image id is the same as before the part (true) | `docker image inspect --format {{.Id}}` before and after |
| `c1.p3.throwaway_present_after` | `tfc-c1-throwaway:1` (keep_locally false, a second name of alpine) is still there (false) | `docker image inspect` |
| `c1.p3.kept_present_after` | `tfc-c1-kept:1` (keep_locally true) is still there (true in the reference; false on the starter) | `docker image inspect` |
| `c1.p3.solo_present_after` | `tfc-c1-solo:1` (own image, one name, keep_locally false) is still there (false) | `docker image inspect` |
| `c1.p3.solo_image_deleted` | The image id of `solo` no longer exists (true) | `docker image inspect <id>` fails |
| `c1.p3.names_removed_count` | How many of the three names are gone (2 in the reference) | Count |

The three names are removed again at the end of every run by exact name; `alpine:3.23` is never named in a removal.

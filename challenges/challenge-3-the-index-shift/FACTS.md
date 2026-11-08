# Facts of challenge 3

Every fact is saved by `run.mjs` through `toolkit/facts.js` into `facts.json`. Names are `c3.p<part>.<what>_<unit>`. Values come from the reference run on Windows 11, Docker Desktop (Engine 29.9.2), Node 22.22.2, runner mode `docker` (Terraform 1.17.1; providers local 2.9.1 and random 3.9.1), 2026-11-08. The challenge creates only files in the part's `work/` folder and records in Terraform state: no Docker objects. No timings, pet names or ids are saved.

## Part 1: count and the shift

The five names are `alpha`, `bravo`, `charlie`, `delta`, `echo`; the resource is `local_file.item` with `count = length(var.names)` and filename `out/item-<index>.txt`. Edits `<edit>`: `remove_first` (alpha), `remove_middle` (charlie), `remove_last` (echo), `reverse` (reverse the order), `insert_front` (add `zulu` in front). All are plans from the same five-name state, never applied, except the middle removal at the end.

| Fact | Meaning | How it was measured |
|---|---|---|
| `c3.p1.baseline_added_count` | Resources made by the five-name apply (5) | `applyCounts()` |
| `c3.p1.<edit>_plan_ok` | The plan printed a `Plan:` line (false when it failed, as on the starter with `count = 5`) | `planCounts()` is not null |
| `c3.p1.<edit>_add_count`, `_change_count`, `_destroy_count` | The numbers on the plan line. In the reference: remove_first 4/0/5, remove_middle 2/0/3, remove_last 0/0/1, reverse 4/0/4, insert_front 6/0/5 | `planCounts()` |
| `c3.p1.<edit>_touched_count` | Resource addresses in the plan | Count of `# address will be ...` and `must be ...` lines |
| `c3.p1.<edit>_prediction_matches` | The learner's three numbers equal the real ones (first three edits only) | Compared with `predictions.json` |
| `c3.p1.predictions_correct_count` | How many of the three match (3 in the reference) | Count |
| `c3.p1.middle_apply_added_count`, `middle_apply_destroyed_count` | `added` and `destroyed` when the middle removal is applied (2, 3) | `applyCounts()` |
| `c3.p1.files_after_middle_apply_count` | Files in `out/` after it (4) | Directory listing |

## Part 2: for_each keys

The resource is `local_file.item` with `for_each = toset(var.names)`, plus `local_file.site` from a map of three objects (`web`, `api`, `docs`).

| Fact | Meaning | How it was measured |
|---|---|---|
| `c3.p2.baseline_plan_ok` | The learner's `main.tf` plans (false on the starter, whose `for_each` gets a list) | Exit code and `Plan:` line |
| `c3.p2.baseline_added_count` | Resources of the baseline apply (8: five items, three sites) | `applyCounts()` |
| `c3.p2.<edit>_plan_ok`, `_add_count`, `_change_count`, `_destroy_count` | The plan numbers for the same five edits as part 1. In the reference: remove_first, remove_middle, remove_last 0/0/1; reverse 0/0/0; insert_front 1/0/0 | `planCounts()`; `No changes` counts as 0/0/0 |
| `c3.p2.reverse_no_changes` | The reversed-list plan said `No changes` | Text match |
| `c3.p2.middle_apply_added_count`, `middle_apply_destroyed_count`, `files_after_middle_apply_count` | The real removal of `charlie`: 0, 1 and 4 files left | `applyCounts()`, directory listing |
| `c3.p2.site_edit_add_count`, `_change_count`, `_destroy_count` | Plan after changing the port of `api` from 8080 to 9090 (1/0/1) | `planCounts()` |
| `c3.p2.site_remove_*` | Plan after removing the site `web` (0/0/1) | `planCounts()` |
| `c3.p2.site_add_*` | Plan after adding the site `blog` (1/0/0) | `planCounts()` |
| `c3.p2.unknown_keys_error_shown` | The demo `for_each = toset(random_pet.app[*].id)` fails with `Invalid for_each argument` | Exit code and text |
| `c3.p2.unknown_keys_fixed_plan_ok`, `unknown_keys_fixed_add_count` | The learner's `unknown-keys/main.tf` plans, with 4 to add (two pets, two files) | `planCounts()` |

The chart of part 2 reads the count destroys from `c3.p1.*_destroy_count`; run part 1 first when you record it.

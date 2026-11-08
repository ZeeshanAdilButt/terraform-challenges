# Facts of challenge 11 (pipeline)

Written to `facts.json` by `run.mjs` of each part, through `setFact`. All come from the recorded reference run (`TFC_MODE=docker`, Terraform 1.17.1). Names follow `c11.p<part>.<what>_<unit>`. Part 3 values are timings of this machine; they vary, and the chapter should quote them as "in the recorded run".

## Part 1: plan on pull request

| Fact | Value (reference) | Meaning and how measured |
|---|---|---|
| `c11.p1.first_plan_add_count` | 3 | Add count of `terraform show` on the first plan file (image, volume, container). |
| `c11.p1.first_run_exit_code` | 0 | Exit code of `node ci/plan.mjs infra` on the first run. |
| `c11.p1.first_run_steps_ok_count` | 5 | Lines ending in `... ok` (init, validate, fmt, plan, show). |
| `c11.p1.md_headline_matches_terraform` | true | The `**Plan: ...**` line of the Markdown has the same three numbers as the `Plan:` line of `terraform show`. |
| `c11.p1.no_changes_md` | true | After an apply, the Markdown says `**No changes.**` |
| `c11.p1.replace_add_count`, `c11.p1.replace_destroy_count` | 1, 1 | Numbers in the Markdown headline after `default = "fast"`. |
| `c11.p1.replace_warning_present` | true | The Markdown ends with a `> **Warning:**` line for that plan. |
| `c11.p1.volume_replace_destroy_count` | 2 | Destroy count after the data volume is renamed (volume and container). |
| `c11.p1.volume_replace_rows_count` | 2 | Table rows in that Markdown. |
| `c11.p1.fmt_failure_exit_code` | 1 | Exit code of `ci/plan.mjs` with a misformatted file (the `terraform fmt -check` step itself exits 3). |
| `c11.p1.fmt_failure_stopped_at_fmt`, `c11.p1.fmt_failure_in_comment` | true, true | The run stopped at the fmt step, and the Markdown says `Failed at the fmt step`. |
| `c11.p1.validate_failure_exit_code` | 1 | Exit code with a typo in a variable name. |
| `c11.p1.validate_failure_stopped_before_fmt` | true | The output has a failed validate step and no fmt line. |
| `c11.p1.validate_failure_text` | `Reference to undeclared input variable` | The `Error:` line of validate. |
| `c11.p1.workflow_uses_count`, `c11.p1.workflow_unpinned_count` | 3, 0 | `uses:` lines in the workflow, and how many do not end in 40 hexadecimal characters (starter: 3 unpinned). |
| `c11.p1.leftover_count` | 0 | Containers, networks and volumes still labelled `tfc.challenge=11`. |

## Part 2: apply the saved plan

| Fact | Value (reference) | Meaning and how measured |
|---|---|---|
| `c11.p2.gate_clean_exit_code` | 0 | Exit code of `ci/gate.mjs` for a plan that only adds a volume. |
| `c11.p2.reviewed_apply_added_count`, `c11.p2.reviewed_apply_destroyed_count` | 1, 0 | The `Apply complete!` line of `ci/apply.mjs` after a change was merged in between. |
| `c11.p2.unreviewed_change_applied` | false | After that apply the container is the same container with `DB_MODE=standard` (starter: true). |
| `c11.p2.pending_destroy_after_apply_count` | 1 | A plan after that apply still shows one destroy: the change waits for its own review. |
| `c11.p2.stale_plan_refused` | true | Applying the saved plan after someone else changed the state fails with `stale` in the error. |
| `c11.p2.stale_exit_code` | 1 | Exit code of the apply step in that case. |
| `c11.p2.stale_error_text` | `Saved plan is stale` | The `Error:` line. |
| `c11.p2.gate_destroy_exit_code` | 1 | Exit code of the gate for the plan that renames the data volume. |
| `c11.p2.gate_destroy_lines_count` | 2 | Lines `replace: <address>` printed (container and volume). |
| `c11.p2.apply_skipped_after_gate` | true | The gate failed, the apply step did not run, the container id is unchanged, the data volume exists. |
| `c11.p2.leftover_count` | 0 | As above. |

## Part 3: two runs, one lock

| Fact | Value (reference) | Meaning and how measured |
|---|---|---|
| `c11.p3.alone_apply_s` | 41.6 | Seconds of the `[apply]` step of a run on its own (30 s of `time_sleep` plus Terraform and Docker work on a loaded machine). |
| `c11.p3.fast_fail_exit_code` | 1 | Exit code of run B with `LOCK_TIMEOUT=0s` while run A applies. |
| `c11.p3.fast_fail_error_text` | `Error acquiring the state lock` | The `Error:` line of that failure. |
| `c11.p3.fast_fail_shows_lock_info` | true | The error has a `Lock Info:` block with `Operation: OperationTypeApply`. |
| `c11.p3.fast_fail_first_run_ok` | true | Run A exited 0 in the same scenario. |
| `c11.p3.fast_fail_after_s` | 16.5 | Seconds from the start of run B (its `init` included) to its first refused `LOCK` (423) in the server log. |
| `c11.p3.wait_median_s`, `c11.p3.wait_min_s`, `c11.p3.wait_max_s` | 31, 31, 31 | Three repetitions with `LOCK_TIMEOUT=120s`: seconds from run B's first 423 to the next `LOCK` answered 200. |
| `c11.p3.waited_runs_ok_count` | 3 | Repetitions where both runs exited 0. |
| `c11.p3.final_state_is_second_count` | 3 | Repetitions where the container ends with run B's message. |
| `c11.p3.lock_denied_count`, `c11.p3.lock_granted_count`, `c11.p3.unlock_count` | 16, 16, 16 | `LOCK` requests answered 423 and 200, and `UNLOCK` requests, over the whole part (Terraform asks again while it waits, so the denied count is the number of retries). |
| `c11.p3.pipeline_has_lock_false`, `c11.p3.pipeline_has_lock_timeout` | false, true | The pipeline file contains `-lock=false` (starter: true), or `-lock-timeout`. |
| `c11.p3.leftover_count` | 0 | Containers, networks and volumes still labelled `tfc.challenge=11` after the final destroy. |

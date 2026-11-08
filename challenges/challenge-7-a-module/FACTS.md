# Challenge 7 facts

All facts are written by `run.mjs` through `setFact`. Names are `c7.p<part>.<what>_<unit>`. Values come from the reference run (`TFC_MODE=docker TFC_REFERENCE=1`, Terraform 1.17.1, `kreuzwerker/docker` 4.6.0). Before each run every fact is reset to its "not done" value, so a stopped run never leaves numbers from an older run behind.

## Part 1: build a module and call it for two environments

| Fact | Reference value | Meaning and how measured |
|---|---|---|
| `c7.p1.init_ok` | true | Exit code of `terraform init` is 0. |
| `c7.p1.plan_add_count` | 5 | `N to add` of the first plan: image, two networks, two containers. |
| `c7.p1.apply_ok` | true | Exit code of `terraform apply tfplan`. |
| `c7.p1.apply_added_count` | 5 | `N added` of the apply. |
| `c7.p1.module_instances_count` | 2 | Child modules in `terraform show -json` (`dev`, `prod`). |
| `c7.p1.output_keys_count` | 3 | Keys of `terraform output -json apps` for `dev`: `container_name`, `ip_address`, `network_name`. The leaky starter has 4 (adds `container`). |
| `c7.p1.output_leaks_token` | false | True when the fake token text `fake-token-not-a-real-secret` is anywhere in `terraform output -json apps`. The starter: true. |
| `c7.p1.environment_validation_rejects` | true | A plan with the environment `qa` fails with `environment must be one of`. |
| `c7.p1.memory_validation_rejects` | true | A plan with `memory_mb = 4096` fails with `memory_mb must be between`. |
| `c7.p1.second_plan_changes_count` | 0 | Add plus change plus destroy of a plan right after apply (`No changes` is 0). |
| `c7.p1.destroyed_count` | 5 | `N destroyed` of `terraform destroy`. |
| `c7.p1.leftover_count` | 0 | Docker containers, networks and volumes still labelled `tfc.challenge=7` after cleanup. |
| `c7.p1.demo_provider_block_error` | `Module is incompatible with count, for_each, and depends_on` | First line of the init error when a `provider` block is added to the module (reference runs only). |
| `c7.p1.demo_missing_requirement_error` | `Did you intend to use kreuzwerker/docker?` | The hint line of the init error when the module has no `required_providers` (reference runs only). |

## Part 2: version a module with Git tags

| Fact | Reference value | Meaning and how measured |
|---|---|---|
| `c7.p2.tags_count` | 3 | Tags in the repository `run.mjs` builds (`v1.0.0`, `v1.1.0`, `v2.0.0`). |
| `c7.p2.init_ok`, `plan_ok`, `apply_ok` | true | Exit codes of init, plan, apply on the learner's `main.tf`. |
| `c7.p2.pinned_to_tag` | true | `?ref=` in `main.tf` is one of the three tags. The starter uses `main`: false. |
| `c7.p2.module_source_recorded` | `git::file:///work/modrepo?ref=v1.1.0` | `Source` of the module in `.terraform/modules/modules.json` after init. |
| `c7.p2.destroyed_count` | 5 | `N destroyed` of the destroy at the end of the main flow. |
| `c7.p2.stale_plan_error` | `Module source has changed` | First error line of `plan` after the ref changed and `init` was not run. |
| `c7.p2.upgrade_minor_changes_count` | 0 | Changes of the plan after `init` at v1.1.0 (from v1.0.0). |
| `c7.p2.upgrade_major_plan_fails` | true | `init` fails at v2.0.0 while the caller still passes `memory_mb`. |
| `c7.p2.upgrade_major_error` | `An argument named "memory_mb" is not expected here.` | The error line of that init. |
| `c7.p2.upgrade_major_fixed_changes_count` | 0 | Changes of the plan after the argument is renamed to `memory_limit_mb`. |
| `c7.p2.version_on_git_source_error` | `Invalid registry module source address` | First error line of init with `version = "~> 1.0"` on a `git::` source. |
| `c7.p2.moved_tag_plain_init_changes_count` | 0 | Changes of the plan after the tag `v1.1.0` was moved to the 2.0.0 commit and a plain `init` ran (no error, no change: the cached copy is kept). |
| `c7.p2.moved_tag_upgrade_plan_fails` | true | `init -upgrade` after the tag moved fails with the rename error. |
| `c7.p2.commit_pin_changes_count` | 0 | Changes of the plan after pinning `?ref=<commit id of the first v1.1.0>`. |
| `c7.p2.leftover_count` | 0 | Docker objects still labelled `tfc.challenge=7`. |

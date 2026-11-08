# Facts of challenge 10 (environments)

Written to `facts.json` by `run.mjs` of each part, through `setFact`. All come from the recorded reference run (`TFC_MODE=docker`, Terraform 1.17.1). Names follow `c10.p<part>.<what>_<unit>`.

## Part 1: workspaces

| Fact | Value (reference) | Meaning and how measured |
|---|---|---|
| `c10.p1.workspaces_count` | 3 | Lines printed by `terraform workspace list` once `dev` and `prod` exist (default, dev, prod). |
| `c10.p1.state_files_count` | 2 | Files named `terraform.tfstate` under `terraform.tfstate.d/` after both applies. |
| `c10.p1.containers_count` | 2 | Containers labelled `tfc.challenge=10` after both applies (`docker ps -a`). |
| `c10.p1.apply_dev_added_count` | 2 | Added resources of the apply in the dev workspace (image resource and container). |
| `c10.p1.apply_prod_ok` | true | The apply in the prod workspace exited 0. False on the starter (container name collision). |
| `c10.p1.wrong_env_destroy_count` | 1 | Destroy count on the `Plan:` line of the plan made in the prod workspace with `-var greeting=hello-dev`. |
| `c10.p1.wrong_env_add_count` | 1 | Add count on that same line. |
| `c10.p1.prod_changed` | true | After the wrong apply, `docker inspect` of the prod container shows `GREETING=hello-dev`. |
| `c10.p1.dev_unchanged` | true | `docker inspect` of the dev container still shows `GREETING=hello`. |
| `c10.p1.default_blocked` | true | A plan in the `default` workspace exits non-zero with `Resource precondition failed`. |
| `c10.p1.default_precondition_text` | text | The precondition's own message, as printed. |
| `c10.p1.delete_nonempty_blocked` | true | `terraform workspace delete dev` exits non-zero with `is not empty`. |
| `c10.p1.delete_nonempty_text` | `Workspace is not empty` | The first line of that error. |
| `c10.p1.leftover_count` | 0 | Containers, networks and volumes still labelled `tfc.challenge=10` at the end. |

## Part 2: directories and an http state

| Fact | Value (reference) | Meaning and how measured |
|---|---|---|
| `c10.p2.state_files_count` | 2 | `.json` files on the state server (`dev/app.json`, `prod/app.json`). |
| `c10.p2.local_tfstate_files_count` | 0 | Environment folders that contain a `terraform.tfstate`. |
| `c10.p2.containers_count` | 2 | Containers labelled `tfc.challenge=10` after the two applies. |
| `c10.p2.dev_serial_before_change` | 1 | `serial` inside the dev state on the server after the first apply. |
| `c10.p2.dev_serial_after_change` | 2 | The same after the dev change. |
| `c10.p2.prod_serial_unchanged` | true | The prod serial is the same before and after the dev change. |
| `c10.p2.prod_plan_no_changes` | true | A plan in `envs/prod` after the dev change says `No changes.` |
| `c10.p2.destroy_dev_ok` | true | `terraform destroy` in `envs/dev` exits 0. |
| `c10.p2.destroy_prod_blocked` | true | `terraform destroy` in `envs/prod` exits non-zero and the output names `prevent_destroy`. |
| `c10.p2.destroy_prod_error_text` | `Instance cannot be destroyed` | The `Error:` line of that failure. |
| `c10.p2.prod_containers_after_blocked_destroy_count` | 1 | Prod containers in Docker after the blocked destroy. |
| `c10.p2.no_guard_destroy_count` | 2 | Destroy count of `terraform plan -destroy` after the `lifecycle` block is deleted. |
| `c10.p2.resource_removed_destroy_count` | 1 | Destroy count of `terraform plan` after the whole `docker_container` block is deleted. |
| `c10.p2.lock_requests_count`, `c10.p2.unlock_requests_count` | 10, 10 | `LOCK` and `UNLOCK` requests the state server saw in the whole part. |
| `c10.p2.lock_denied_count` | 0 | `LOCK` requests answered 423. None: the runs never overlap in this part. |
| `c10.p2.leftover_count` | 0 | As above. |

## Part 3: least privilege by token

| Fact | Value (reference) | Meaning and how measured |
|---|---|---|
| `c10.p3.secrets_in_files_count` | 0 | Files of the work folder that contain a token string. 2 on the starter. |
| `c10.p3.dev_engineer_dev_ok` | true | `init` and `plan` in `envs/dev` with the dev token. |
| `c10.p3.dev_engineer_prod_denied` | true | `init` in `envs/prod` with the dev token fails. |
| `c10.p3.nobody_denied` | true | `init` in `envs/dev` with no password fails. |
| `c10.p3.ci_dev_dev_ok`, `c10.p3.ci_dev_apply_ok` | true, true | The CI identity of dev can plan and apply in dev. |
| `c10.p3.ci_dev_prod_denied` | true | The same identity is denied in prod. |
| `c10.p3.ci_prod_prod_ok`, `c10.p3.ci_prod_dev_denied` | true, true | The CI identity of prod, in its own and in the other folder. |
| `c10.p3.denied_requests_count` | 4 | Requests the state server answered 401 (one `GET` of the state per denied `init`). |
| `c10.p3.prod_serial_unchanged` | true | The prod state's serial before and after all tries. |
| `c10.p3.denial_text` | text | The error the developer got in `envs/prod`. |
| `c10.p3.leftover_count` | 0 | As above. |

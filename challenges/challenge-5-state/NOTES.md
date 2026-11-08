# Notes: challenge 5, state

Built against Terraform 1.17.1 (image `hashicorp/terraform:1.17.1`, `TFC_MODE=docker`). Providers: `hashicorp/local` 2.9.1, `hashicorp/time` 0.14.2, `kreuzwerker/docker` 4.6.0, the built-in `terraform_data`. Docker objects: only `tfc-c5-app`, labelled `tfc.challenge=5`. State server port: 8810 (part 2). Do not run two parts of this challenge at once: each calls `cleanup(5)` when it starts and ends, and doing so removed a container the other part was using during the build.

## What each part proves

- **Part 1, state commands.** A rename in code looks like destroy plus create (`Plan: 1 to add, 0 to change, 2 to destroy.`). `state mv` fixes a rename, `state rm` makes Terraform forget a resource and leaves the real file, and the plan afterwards says `No changes`. The learner writes the commands in `commands.txt`; `run.mjs` only runs `state list|show|mv|rm|pull`.
- **Part 2, two applies, one lock.** With only `address` in the http backend, two applies both run and nobody is told (`c5.p2.unlocked_apply_complete_count` is 2, with 0 lock requests). With `lock_address` and `unlock_address`: the second apply gets the real lock error, `-lock-timeout` waits (and gives up or gets through), a stale lock blocks `plan`, and `force-unlock` with the ID from the error clears it. `run.mjs` hosts the toolkit state server in its own process and uses `tfAsync` for every call. Alice and bob are two checkouts with one state name.
- **Part 3, lost state and restore.** After the state file is deleted the plan wants to add everything and the apply fails on the container name. Recovery A copies the backup back (the plan then wants only the release record: a backup is one apply behind). Recovery B imports the container. The starter's plan after the import wants to destroy and rebuild the container; the lifecycle block fixes it.

## What differs from the roadmap, the hints or the dossier (all checked by running)

1. **`state mv` and `state rm` do not write `terraform.tfstate.backup`.** Each writes its own `terraform.tfstate.<unix time>.backup`. `terraform.tfstate.backup` comes from `apply` (and only from the second write of a state on), so after a first apply there is no such file.
2. **The backup survives failed applies but not a state-writing one.** After the state file was deleted, two failed applies left `terraform.tfstate.backup` untouched. An apply that writes the state (`-replace=terraform_data.release`, which succeeded for that resource and failed for the container) copied the half-written state over it, and the container was gone from the only backup. The recorded step shows this, which is why `run.mjs` copies the backup aside first. My first guess, that a second plain failed apply would overwrite it, was wrong, and the run said so.
3. **`docker_image` cannot be imported:** `Error: resource docker_image doesn't support import` (seen in a scratch run, not recorded). The dossier's import hint is about `docker_container`.
4. **Importing `docker_container` is not clean in provider 4.6.0.** The plan right after `terraform import` wants to replace the container. In the recorded starter run the lines that said `# forces replacement` were `env` and `labels` (`Plan: 2 to add, 0 to change, 1 to destroy.`). In a scratch run on a container made from an image id, `image` was flagged too. The fix used is `lifecycle { ignore_changes = [image, env, labels] }`; with it the plan is `1 to add, 1 to change, 0 to destroy` (the release record, and an in-place update of arguments the provider does not read back), and afterwards `No changes`. The container id does not change.
5. **The http backend lock message** is exactly what the orchestrator saw: `HTTP remote state already locked:` followed by `ID=<id>` and a `Lock Info:` block with `ID`, `Path`, `Operation`, `Who`, `Version`, `Created`, `Info`. Defaults of `lock_method` (`LOCK`) and `unlock_method` (`UNLOCK`) are right, so only the two addresses are needed.
6. **`-lock-timeout=5s` took 10.6 s** from start to finish in the recorded run, because Terraform retries on its own schedule and each run starts a container. The fact `c5.p2.lock_timeout_short_waited_s` is a single measurement (not a median) and the README says so. Do not quote the exact seconds.
7. **The toolkit state server ignores the ID in `UNLOCK`:** `terraform force-unlock -force wrong-id` also unlocked (seen in a scratch run). The part does not demonstrate a wrong ID. A real server may refuse. `force-unlock` prints colour codes (it is not in the toolkit's `-no-color` list); `run.mjs` strips them.
8. **The unlocked state is not corrupted in a visible way.** Both applies finish with `Apply complete! Resources: 1 added`. The harm is that nothing stops it, which is what the part shows; it does not show a broken state file.
9. **Part 2 `Who:` is `root@<container id>`** because Terraform runs in the container.

## Problems hit while building

- **Shared plugin cache races** with other builders (`Failed to install provider`, `text file busy`, `Required plugins are not installed ... does not match any of the checksums`, `Inconsistent dependency lock file`). `lib.mjs` has `initRetry`, `tfRetry`, `tfAsyncRetry` and `initAsync` that wait, reset the scratch folder and init again. Concurrent applies in part 2 use two separate folders so a retry in one cannot break the other.
- **`facts.json` loses writes when several builders run at once.** Runs wrote through `TFC_FACTS_PATH` to a private file; the facts were merged at the end.
- **A long reference run of part 3 is about 4 minutes**, and a shell `timeout 400` once killed it silently halfway. Run it without a short timeout.

## Lines to quote

Part 1 (`results.md`):

```text
Plan: 1 to add, 0 to change, 2 to destroy.
```

```text
Move "local_file.notes" to "local_file.readme"
Successfully moved 1 object(s).
Removed local_file.legacy
Successfully removed 1 resource instance(s).
```

```text
No changes. Your infrastructure matches the configuration.
```

Part 2:

```text
Error: Error acquiring the state lock
Error message: HTTP remote state already locked:
ID=<lock id>
Lock Info:
  ID:        <lock id>
  Path:
  Operation: OperationTypeApply
  Who:       root@<container id>
  Version:   1.17.1
  Created:   <time>
  Info:
```

```text
Terraform acquires a state lock to protect the state from being written
by multiple users at the same time. Please resolve the issue above and try
again. For most commands, you can disable locking with the "-lock=false"
flag, but this is not recommended.
```

```text
Acquiring state lock. This may take a few moments...
```

```text
Terraform state has been successfully unlocked!
The state has been unlocked, and Terraform commands should now be able to
obtain a new lock on the remote state.
```

Part 3:

```text
No state file was found! State management commands require a state file. Run this command in a directory where Terraform has been run or use the -state flag to point the command to a specific state location.
```

```text
Error: Unable to create container: Error response from daemon: Conflict. The container name "/tfc-c5-app" is already in use by container "<id>". You have to remove (or rename) that container to be able to reuse that name.
```

```text
Plan: 2 to add, 0 to change, 0 to destroy.            (state lost)
Plan: 1 to add, 0 to change, 0 to destroy.            (backup restored: only the release record)
Plan: 1 to add, 1 to change, 0 to destroy.            (container imported, with the lifecycle fix)
Plan: 2 to add, 0 to change, 1 to destroy.            (container imported, starter files: seen in the starter run, not in results.md)
```

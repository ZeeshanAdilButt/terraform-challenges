# Notes on challenge 13: upgrade and recover

Every output below is from a real run of Terraform 1.17.1 and OpenTofu 1.13.9 (`TFC_MODE=docker`), and of Terraform 1.16.7 where named, recorded in the `results.md` of each part. Facts are in [FACTS.md](FACTS.md).

## What each part proves

- **Part 1, provider upgrade.** The lock file wins over a loosened constraint: with `>= 3.1` a plain `init` still reuses `3.1.3`. A new constraint that the lock does not satisfy is an error (`Failed to query available provider packages` ... `must use terraform init -upgrade`) until the upgrade is done on purpose. The upgrade of `random` 3.1.3 to 3.9.1 and `local` 2.1.0 to 2.9.1 did not change the plan (`No changes.`) but made `terraform validate` print two `Attribute Deprecated` warnings. The learner bounds the constraints with `~>`, renames the deprecated argument, and ends with 0 warnings and an empty plan. Last step: the same folder with Terraform 1.16.7 and 1.17.1.
- **Part 2, failed apply.** Two containers publish host port 8841. The apply builds the network and `first`, fails on `second` (`port is already allocated`), never tries `third`. State and Docker disagree: the state lists `second` (tainted), Docker has it in status `created`. Recovery is fix, plan (`docker_container.second is tainted, so must be replaced`, `2 to add, 0 to change, 1 to destroy`), apply; `first` keeps its id. `apply -replace` replaces a healthy container on request. A lock left behind by a killed run stops the next plan with `Error acquiring the state lock` and its info; `force-unlock -force <ID>` clears it.
- **Part 3, OpenTofu.** The same code gives the same counts with both tools. OpenTofu takes over a Terraform state with one lock file rewrite; Terraform needs `init -upgrade` to take it back. `plan -exclude` exists only in OpenTofu. State encryption turns `terraform.tfstate` into ciphertext that Terraform refuses (`Unsupported state file format`) and that OpenTofu cannot read without the key.

## Deviations from the roadmap and the dossier (with the evidence)

1. **No provider pair in the pinned family changes a plan.** The brief asked for a real pair of versions where `init -upgrade` changes the plan or shows a warning. Tried, with an apply on the old version, `init -upgrade`, and a plan: `kreuzwerker/docker` 3.6.1, 4.0.0, 4.2.0 and 4.5.0 each to 4.6.0 on a network and a container (`No changes.` every time; 4.5.0 to 4.6.0 also with a healthcheck, and with a changed healthcheck interval, which is an in-place change under both); `hashicorp/random` 3.1.3 to 3.9.1 and `hashicorp/local` 2.1.0 or 2.2.0 to 2.9.1 on nine resources (`No changes.`; nine resources with local 2.2.0, two with local 2.1.0). What does change is a **warning**: `random_string` and `random_password` with `number` give `Attribute Deprecated` ("This is deprecated, use `numeric` instead.") on `random` 3.9.1, and `local_file` with `sensitive_content` gives `Use the local_sensitive_file resource instead`. Part 1 builds on the `number` warning and says plainly that no plan changed. The dossier's AWS 4.0 example (a plan that changes after a major upgrade) could not be reproduced with these providers.
2. **Terraform 1.16.7 against 1.17.1: almost nothing differs.** Same plan. Visible differences: `init` prints `Reusing previous version of hashicorp/random from the dependency lock file` on 1.16.7 and `Reusing version 3.9.1 of hashicorp/random from the dependency lock file` on 1.17.1 (the 1.17 changelog says "`init` logs include provider versions"); `terraform version -json` has `"format_version": "1.0"` on 1.17.1 and not on 1.16.7 (the changelog notes it); 1.16.7 adds `"terraform_outdated": true` and "Your version of Terraform is out of date!" lines when the version check can reach the network.
3. **Terraform does not refuse a state written by a newer Terraform.** 1.16.7 applied on a state with `"terraform_version": "1.17.1"` and rewrote the field to `1.16.7`. We expected `state snapshot was created by Terraform v..., which is newer than current`. We did not see that message. Teach `required_version` and one pinned version in CI.
4. **A failed container start taints the resource.** The provider creates the container, fails on start (`Unable to start container: ... driver failed programming external connectivity ... Bind for 127.0.0.1:8841 failed: port is already allocated`), and the state keeps `docker_container.second` as tainted: the next plan says `docker_container.second is tainted, so must be replaced`. Docker keeps the container in status `created`.
5. **The stuck lock is made, not caused.** A stuck lock from a really interrupted run was not attempted: it would depend on timing. `run.mjs` sends the same `LOCK` request Terraform sends to the toolkit state server and never sends `UNLOCK`. The error text, `force-unlock` and the plan afterwards are real. The README says so. The toolkit state server accepts any lock ID on `UNLOCK`; a real server might reject a wrong ID, which the part does not claim.
6. **`force-unlock` prints colour codes** even with `TF_CLI_ARGS_*=-no-color` for the commands in `toolkit/tf.js` (`force-unlock` is not in its list). `run.mjs` strips them. Not a toolkit change.
7. **OpenTofu rewrites the lock file by itself.** `tofu init` on a Terraform lock file prints `Warning: Dependency lock file entries automatically updated` with `registry.terraform.io/hashicorp/local => registry.opentofu.org/hashicorp/local` (same for random), keeps the versions and drops the hashes (`The version selections were preserved, but the hashes were not because the OpenTofu project's provider releases are not byte-for-byte identical.`). The dossier (section 2.2) says only that the default registry is `registry.opentofu.org`.
8. **The way back needs `init -upgrade`.** After `tofu apply` the state says `terraform_version` 1.13.9 and its provider addresses say `registry.opentofu.org`; the lock file names only `registry.opentofu.org`. `terraform plan` stops with `Error: Inconsistent dependency lock file`; `terraform init -upgrade` repairs it (both registries in the lock file) and the plan is `No changes.`. The retry helper `tfx` would hide this error (it repeats a command after `init` on that error), so the step uses plain `tf()`.
9. **`-exclude`** works on OpenTofu 1.13.9 (`Plan: 3 to add` instead of 4, with `Warning: Resource targeting is in effect`) and Terraform 1.17.1 answers `flag provided but not defined: -exclude`, exit code 1. Matches the dossier (plan page of Terraform does not list it).
10. **State encryption** with `pbkdf2` and `aes_gcm` works as the dossier says (OpenTofu 1.7 and later). The encrypted file starts `{"serial":1,"lineage":...,"meta":{"key_provider.pbkdf2.main":...},"encrypted_data":"..."}` and contains no resource names. A `.tofu` file for the encryption block keeps the folder usable by Terraform (Terraform ignores `.tofu` files), so Terraform fails on the state, not on the configuration.
11. **Shared plugin cache races and Docker CLI crashes** as in challenge 12 (`text file busy`, `cached package ... does not match any of the checksums`, `fatal error: unexpected signal`). `lib.mjs` retries and `cleanAll()` repeats the label cleanup.

## Lines to quote

Part 1:
- `Error: Failed to query available provider packages`
- `3.1.3 does not match configured version constraint ~> 3.9; must use terraform init -upgrade to allow selection of new versions` (the text wraps over lines in the real output)
- `Terraform has made some changes to the provider dependency selections recorded in the .terraform.lock.hcl file.`
- `Warning: Attribute Deprecated` with `**NOTE**: This is deprecated, use numeric instead.`
- `- Reusing previous version of hashicorp/random from the dependency lock file` (1.16.7) and `- Reusing version 3.9.1 of hashicorp/random from the dependency lock file` (1.17.1)

Part 2:
- `Error: Unable to start container: Error response from daemon: failed to set up container networking: driver failed programming external connectivity on endpoint tfc-c13-second ...: Bind for 127.0.0.1:8841 failed: port is already allocated`
- `# docker_container.second is tainted, so must be replaced`
- `# docker_container.first will be replaced, as requested`
- `Error: Error acquiring the state lock` and the `Lock Info:` fields `ID:`, `Path:`, `Operation:`, `Who:`, `Version:`, `Created:`
- `Terraform state has been successfully unlocked!`

Part 3:
- `Warning: Dependency lock file entries automatically updated`
- `Error: Inconsistent dependency lock file` and `provider registry.terraform.io/hashicorp/local: required by this configuration but no version is selected`
- `flag provided but not defined: -exclude`
- `Unsupported state file format` (Terraform on the encrypted state; its full text is `The state file does not have a "version" attribute, which is required to identify the format version.`)
- `This state file is encrypted and can not be read without an encryption configuration` (OpenTofu without the block)

## Differences per platform

- Ids, timestamps, pet names and passwords differ on every run. Counts and messages do not.
- Parts 1 and 3 need no Docker daemon objects, but run Terraform and OpenTofu from the pinned images unless a suitable local binary exists; step 5 and 6 of part 1 always use the 1.16.7 image.
- Part 2 publishes host ports 8841 and 8842 on 127.0.0.1 and uses port 8840 for the lock demo. A machine that already uses them needs different numbers.
- In local mode the state server is reached at `127.0.0.1`, in docker mode at `host.docker.internal`.
- A part run takes 3 to 8 minutes on a loaded Docker Desktop for Windows machine, because each Terraform command starts a container.

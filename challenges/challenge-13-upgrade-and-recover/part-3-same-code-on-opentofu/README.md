# Challenge 13, part 3: the same code on OpenTofu

**Time:** about 50 minutes. **Download:** the image `ghcr.io/opentofu/opentofu:1.13.9` (about 190 MB), and the `random` and `local` providers from the OpenTofu registry (a few MB). **Safety rules:** [SAFETY.md](../../../SAFETY.md). No Docker objects are made in this part.

## The problem

Someone in the team says: "We should move to OpenTofu." Someone else says: "Everything will break." Neither has tried it. You are asked for a decision by Friday.

You can decide in an afternoon, with evidence: run the same code with both tools, move one state from one to the other and back, and list what one has that the other does not.

## The idea

**OpenTofu** is a fork of Terraform, developed in the open under the Mozilla Public License 2.0 (a CNCF sandbox project). The language is the same HCL. The command is `tofu` instead of `terraform`. For everyday code you change nothing.

Where the two tools meet, there are three places to watch:

1. **The registry.** Terraform downloads providers from `registry.terraform.io`. OpenTofu downloads them from `registry.opentofu.org`. The provider versions are the same; OpenTofu says its provider releases are not byte-for-byte identical to Terraform's, so the lock file hashes differ. The lock file names the registry.
2. **The state.** Both read the same state file format. They write their own version number and their own registry address into it.
3. **Features only one has.** OpenTofu has, among others, `plan -exclude` (since 1.9), built-in state encryption (since 1.7), and a `.tofu` file extension that Terraform ignores. Terraform has features OpenTofu does not have (Terraform Policy, for example). A feature that only one tool has is a lock-in decision, and you should make it on purpose.

**State encryption** means the state file is encrypted at rest by the tool itself. You give it a key provider (here: a passphrase turned into a key) and a method (here: AES-GCM). The state file becomes one block of ciphertext. Terraform has no such feature; it tells you to encrypt at the backend (a bucket, a service). The passphrase never goes into a file: it arrives as an environment variable.

## What is in this folder

| File | What it is |
|---|---|
| `main.tf`, `versions.tf` | The code from part 1 after the upgrade (random and local providers). Done for you. |
| `encryption.tofu` | **Blank to fill.** The state encryption configuration. The `.tofu` extension is on purpose: OpenTofu reads the file, Terraform ignores it. |

## Steps

| # | Command | What happens |
|---|---|---|
| 1 | `node challenges/challenge-13-upgrade-and-recover/part-3-same-code-on-opentofu/run.mjs` | Runs the code with both tools, moves a state over and back, tries `-exclude`, then encrypts the state with your `encryption.tofu` and shows how both tools react. About 5 minutes. |
| 2 | `node --test challenges/challenge-13-upgrade-and-recover/part-3-same-code-on-opentofu/test.mjs` | Fails on purpose until the state is encrypted. |
| 3 | Edit `encryption.tofu` | A `variable "state_passphrase"`, a `key_provider "pbkdf2"`, a `method "aes_gcm"` and a `state` block, as the comments say. |
| 4 | Run step 1 again, then the test | The state holds only `encrypted_data`, OpenTofu plans it with `No changes`, Terraform refuses it. |
| 5 | `node toolkit/show-facts.mjs c13.p3` | Shows the saved facts. |

The passphrase used by `run.mjs` and the test is a test value, set in the environment as `TF_VAR_state_passphrase`. For real work you would take it from your secret store in the same way.

## What you should see

The recorded run is in [results.md](results.md). In short:

1. **Two version lines:** `Terraform v1.17.1` and `OpenTofu v1.13.9`.
2. **Two lock files:** the Terraform one names `registry.terraform.io/hashicorp/random`, the OpenTofu one `registry.opentofu.org/hashicorp/random`. Same version (3.9.1), different hashes.
3. **Same code, same result:** both say `Apply complete! Resources: 4 added, 0 changed, 0 destroyed.` and a second plan of `No changes.`
4. **OpenTofu takes over a Terraform state:** `tofu init` prints `Warning: Dependency lock file entries automatically updated` and the lines `registry.terraform.io/hashicorp/local => registry.opentofu.org/hashicorp/local`. The plan is `No changes.` After a `tofu apply` the state says `terraform_version` 1.13.9 and its provider addresses say `registry.opentofu.org`.
5. **Going back:** Terraform's plan stops with `Error: Inconsistent dependency lock file` (`provider registry.terraform.io/hashicorp/local: required by this configuration but no version is selected`). `terraform init -upgrade` repairs the lock file, and the plan is `No changes.` again. Switching tools means running `init` again, and committing the lock file change.
6. **`-exclude`:** `tofu plan` is `4 to add`, `tofu plan -exclude=local_file.greeting` is `3 to add` with the targeting warning. Terraform answers `flag provided but not defined: -exclude`, exit code 1.
7. **State encryption:** in the plain state file `random_pet` can be read 2 or more times, in the encrypted one 0 times, and the file contains `encrypted_data`. OpenTofu plans it with `No changes.` Terraform stops with `Unsupported state file format`. OpenTofu without the encryption block stops with `This state file is encrypted and can not be read without an encryption configuration`.

What this says for the decision: for plain code the move costs one lock file change. A state can go back and forth if you re-run `init`. The costs are in the features: if you use `-exclude` or state encryption, or write `.tofu` files, going back to Terraform is a project, not a command. Terraform on the other side has its own exclusive features, and the registries and the licences differ (Business Source License for Terraform, Mozilla Public License 2.0 for OpenTofu). This course teaches the common ground, and tags every feature that only one tool has.

![Times "random_pet" can be read in the state file](chart.svg)

## Where each number comes from

| Fact | Where it comes from |
|---|---|
| `c13.p3.terraform_version_line`, `c13.p3.tofu_version_line` | The first line of `terraform version` and `tofu version`. |
| `c13.p3.terraform_lock_registry`, `c13.p3.tofu_lock_registry`, `c13.p3.same_random_version_in_both_locks`, `c13.p3.lock_hashes_identical` | The two lock files after `init`. |
| `c13.p3.terraform_apply_added_count`, `c13.p3.tofu_apply_added_count`, `c13.p3.both_second_plans_empty` | The two applies and the plans after them. |
| `c13.p3.tofu_rewrites_lock_registry`, `c13.p3.tofu_plan_on_terraform_state_no_changes` | `tofu init` and `tofu plan` on a Terraform state. |
| `c13.p3.state_version_after_tofu_apply`, `c13.p3.terraform_plan_after_tofu_error`, `c13.p3.terraform_plan_after_init_upgrade_no_changes` | The state file after `tofu apply`, and Terraform's plan before and after `init -upgrade`. |
| `c13.p3.tofu_plain_plan_add_count`, `c13.p3.tofu_exclude_plan_add_count`, `c13.p3.terraform_exclude_error`, `c13.p3.terraform_exclude_exit_code` | `plan` and `plan -exclude` with each tool. |
| `c13.p3.plain_state_name_occurrences_count`, `c13.p3.encrypted_state_name_occurrences_count`, `c13.p3.state_is_encrypted`, `c13.p3.tofu_plan_on_encrypted_state_no_changes` | A search for `random_pet` in the two state files, and `tofu plan` on the encrypted one. |
| `c13.p3.terraform_reads_encrypted_state`, `c13.p3.terraform_encrypted_state_exit_code`, `c13.p3.terraform_encrypted_state_error`, `c13.p3.tofu_without_key_error` | `terraform plan` on the encrypted state, and `tofu plan` without the encryption block. |

## Platform box

- **Linux and WSL2, Docker Desktop, Codespace:** the same output. Provider versions are the newest the registries offer within `~> 3.9` and `~> 2.9`.
- **A local `tofu` binary of 1.13 or newer** gives the same output. Install it only if you want to; the toolkit runs the pinned image otherwise (`TFC_TOOL=tofu`). The run switches between `terraform` and `tofu` by itself.

Related: part 1 upgrades a provider, part 2 recovers from a failed apply.

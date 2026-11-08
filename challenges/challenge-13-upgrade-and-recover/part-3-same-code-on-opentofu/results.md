# Results: Challenge 13, part 3: the same code on OpenTofu

Recorded run. Machine: Windows 11, Docker Desktop, Terraform v1.17.1 (docker mode) and OpenTofu 1.13.9, Node 22.22.2. Date: 2026-11-08.

## Step 1

**Command**

```sh
terraform version ; tofu version
```

**Output**

```text
Terraform v1.17.1
OpenTofu v1.13.9
```

**Note:** Two programs from two projects. The language is the same HCL; the version numbers are unrelated.

## Step 2

**Command**

```sh
terraform init ; tofu init ; grep provider .terraform.lock.hcl   (same two files, two folders)
```

**Output**

```text
terraform: - Installing hashicorp/random v3.9.1... | Terraform has been successfully initialized!
tofu:      - Installing hashicorp/random v3.9.1 to the shared cache directory... | OpenTofu has been successfully initialized!
terraform lock:
"registry.terraform.io/hashicorp/local"
"registry.terraform.io/hashicorp/random"
tofu lock:
"registry.opentofu.org/hashicorp/local"
"registry.opentofu.org/hashicorp/random"
```

**Note:** OpenTofu downloads from its own registry, registry.opentofu.org, and the lock file says so. Both registries serve the same provider versions, but the hashes differ: OpenTofu says its provider releases are not byte-for-byte identical to those of Terraform.

## Step 3

**Command**

```sh
terraform apply ; tofu apply ; plan with each
```

**Output**

```text
terraform: Apply complete! Resources: 4 added, 0 changed, 0 destroyed.  then: No changes. Your infrastructure matches the configuration.
tofu:      Apply complete! Resources: 4 added, 0 changed, 0 destroyed.  then: No changes. Your infrastructure matches the configuration.
```

**Note:** Same code, same result, same counts. For everyday configuration the two tools are interchangeable.

## Step 4

**Command**

```sh
tofu init ; tofu plan   (a folder with a state that Terraform wrote and a lock file that says registry.terraform.io)
```

**Output**

```text
Warning: Dependency lock file entries automatically updated
  - registry.terraform.io/hashicorp/local => registry.opentofu.org/hashicorp/local
  - registry.terraform.io/hashicorp/random => registry.opentofu.org/hashicorp/random
The version selections were preserved, but the hashes were not because the
OpenTofu has been successfully initialized!
No changes. Your infrastructure matches the configuration.
```

**Note:** OpenTofu reads the state, rewrites the lock file from registry.terraform.io to registry.opentofu.org, keeps the versions, and drops the hashes. The plan is empty: the move is a non-event. The lock file change is the only thing to commit.

## Step 5

**Command**

```sh
tofu apply -replace=random_pet.name ; terraform plan ; terraform init -upgrade ; terraform plan
```

**Output**

```text
state written by: 1.17.1 -> 1.13.9   provider addresses in the state: registry.opentofu.org
tofu apply: Apply complete! Resources: 2 added, 0 changed, 2 destroyed.
terraform plan: Error: Inconsistent dependency lock file | The following dependency selections recorded in the lock file are | inconsistent with the current configuration: |   - provider registry.terraform.io/hashicorp/local: required by this configuration but no version is selected
terraform init -upgrade: ok
terraform plan: No changes. Your infrastructure matches the configuration.
```

**Note:** Going back is not free. After OpenTofu applied, the lock file names registry.opentofu.org, and Terraform stops with "Inconsistent dependency lock file". terraform init -upgrade fixes the lock file, and the plan is empty again. Both tools can share a state, one after the other, if you re-run init each time you switch.

## Step 6

**Command**

```sh
tofu plan ; tofu plan -exclude=local_file.greeting ; terraform plan -exclude=local_file.greeting
```

**Output**

```text
tofu plan:          Plan: 4 to add, 0 to change, 0 to destroy.
tofu plan -exclude: Plan: 3 to add, 0 to change, 0 to destroy.  Warning: Resource targeting is in effect
terraform plan -exclude:
Error: Failed to parse command-line flags
flag provided but not defined: -exclude
For more help on using this command, run:
```

**Note:** -exclude is the opposite of -target: plan everything except this address and what depends on it. OpenTofu has it (since 1.9); Terraform does not know the flag. Like -target it is for repairs, not for routine work.

## Step 7

**Command**

```sh
tofu init ; tofu apply   (your encryption.tofu, passphrase from TF_VAR_state_passphrase) ; look inside terraform.tfstate
```

**Output**

```text
Apply complete! Resources: 4 added, 0 changed, 0 destroyed.
plain state:     "random_pet" appears 2 times
encrypted state: "random_pet" appears 0 times, "encrypted_data" present: true
state file starts: {"serial":1,"lineage":"5a6757dc-2057-ac90-94bd-2feb956eccff"
tofu plan: No changes. Your infrastructure matches the configuration.
```

**Note:** The state file is now one block of ciphertext. Nothing in it is readable, not the resource names, not the generated password that random_password stores. A plain state file keeps every secret in the clear.

## Step 8

**Command**

```sh
terraform plan ; tofu plan   (without encryption.tofu)
```

**Output**

```text
terraform: exit 1  Error message: Unsupported state file format: The state file does not have a
tofu without the encryption block: exit 1  Error message: failed to write backup file: Unsupported state file format: This state file is encrypted and can not be read without an encryption
```

**Note:** Terraform cannot read an OpenTofu-encrypted state at all. OpenTofu without the key cannot either. Encryption is a one-way door between the tools, and the passphrase is now part of your disaster recovery: lose it and the state is gone.

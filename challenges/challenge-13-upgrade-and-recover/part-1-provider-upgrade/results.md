# Results: Challenge 13, part 1: a provider upgrade, the lock file, and two Terraform versions

Recorded run. Machine: Windows 11, Docker Desktop, Terraform v1.17.1 (docker mode), Node 22.22.2. Date: 2026-11-08.

## Step 1

**Command**

```sh
terraform apply   (the OLD code: before/, exact pins 3.1.3 and 2.1.0) ; cat .terraform.lock.hcl
```

**Output**

```text
Apply complete! Resources: 4 added, 0 changed, 0 destroyed.
random  version 3.1.3  constraints 3.1.3
local   version 2.1.0  constraints 2.1.0
terraform validate: 0 warnings, 0 errors
```

**Note:** The lock file recorded exactly what init chose. Nothing complains: this code is clean on these versions.

## Step 2

**Command**

```sh
terraform init   (constraints loosened to ">= 3.1" and ">= 2.1")
```

**Output**

```text
- Reusing version 2.1.0 of hashicorp/local from the dependency lock file
- Reusing version 3.1.3 of hashicorp/random from the dependency lock file
- Using previously-installed hashicorp/local v2.1.0
- Using previously-installed hashicorp/random v3.1.3
Terraform has been successfully initialized!
```

**Note:** Newer releases exist, and the new constraints allow them. init still keeps the locked versions: the lock file wins over the constraint until you ask for an upgrade.

## Step 3

**Command**

```sh
terraform init ; terraform init -upgrade ; terraform validate ; terraform plan   (the ORIGINAL code, new constraints "~> 3.9" and "~> 2.9")
```

**Output**

```text
Error: Failed to query available provider packages
Could not retrieve the list of available versions for provider
hashicorp/random: locked provider registry.terraform.io/hashicorp/random
3.1.3 does not match configured version constraint ~> 3.9; must use terraform
init -upgrade to allow selection of new versions
- Installing hashicorp/local v2.9.1...
- Installing hashicorp/random v3.9.1...
Terraform has made some changes to the provider dependency selections recorded
validate: 2 warnings, 0 errors
warning: Attribute Deprecated
warning: Attribute Deprecated
plan: No changes. Your infrastructure matches the configuration.
```

**Note:** Plain init refuses: the locked version does not fit the new constraint. init -upgrade installs the newest versions that fit. The plan is unchanged, and the upgrade brought two deprecation warnings. Today they are warnings.

## Step 4

**Command**

```sh
terraform init ; terraform init -upgrade   (your versions.tf)
```

**Output**

```text
Error: Failed to query available provider packages
Could not retrieve the list of available versions for provider
hashicorp/random: locked provider registry.terraform.io/hashicorp/random
3.1.3 does not match configured version constraint ~> 3.9; must use terraform
init -upgrade to allow selection of new versions
- Installing hashicorp/local v2.9.1...
- Installing hashicorp/random v3.9.1...
Terraform has made some changes to the provider dependency selections recorded
before:
random  version 3.1.3  constraints 3.1.3
local   version 2.1.0  constraints 2.1.0
after:
random  version 3.9.1  constraints ~> 3.9
local   version 2.9.1  constraints ~> 2.9
```

**Note:** The lock file is the record of an upgrade. Its diff belongs in the pull request, next to the code change.

## Step 5

**Command**

```sh
terraform validate -json ; terraform plan   (your main.tf)
```

**Output**

```text
validate: 0 warnings, 0 errors

No changes. Your infrastructure matches the configuration.
```

**Note:** The goal: no warnings and no changes. A provider upgrade is done when the code uses the new names and the plan is empty.

## Step 6

**Command**

```sh
terraform version ; terraform version -json ; terraform init ; terraform plan   (Terraform 1.16.7, then 1.17.1, same folder)
```

**Output**

```text
Terraform v1.16.7  plan: No changes. Your infrastructure matches the configuration.
  init says:        - Reusing previous version of hashicorp/random from the dependency lock file
  version -json has format_version: false
Terraform v1.17.1  plan: No changes. Your infrastructure matches the configuration.
  init says:        - Reusing version 3.9.1 of hashicorp/random from the dependency lock file
  version -json has format_version: true
```

**Note:** The plan is the same. What differs is small: the wording of init (1.17 names the version it reuses) and one more field in version -json. The upgrade of the tool itself was uneventful here; that is a result, not a promise.

## Step 7

**Command**

```sh
terraform apply -replace=random_pet.name   (1.17.1) ; same with 1.16.7 ; grep terraform_version terraform.tfstate
```

**Output**

```text
state written by 1.17.1: terraform_version 1.17.1
1.16.7 apply: Apply complete! Resources: 2 added, 0 changed, 2 destroyed.
state after 1.16.7:     terraform_version 1.16.7
```

**Note:** Terraform 1.16.7 did not refuse a state that 1.17.1 had written. It applied, and it wrote its own version into the file. Downgrading the tool is not blocked here, so the only protection is your team agreeing on one version (required_version).

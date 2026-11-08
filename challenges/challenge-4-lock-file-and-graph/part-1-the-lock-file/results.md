# Results: Challenge 4, part 1: the lock file

Recorded run. Machine: win32, reference solution, Node 22.22.2, TFC_MODE=docker. Date: 2026-11-08.

## Step 1

**Command**

```sh
grep -n "lock" team.gitignore
```

**Output**

```text
(no line mentions the lock file)
```

**Note:** Nothing keeps the lock file out of Git. Good: it is meant to be committed.

## Step 2

**Command**

```sh
terraform init
```

**Output**

```text
Initializing the backend...
Initializing provider plugins...
- Finding hashicorp/local versions matching "~> 2.9"...
- Installing hashicorp/local v2.9.1...
- Installed hashicorp/local v2.9.1 (signed by HashiCorp)
Terraform has created a lock file .terraform.lock.hcl to record the provider
selections it made above. Include this file in your version control repository
so that Terraform can guarantee to make the same selections by default when
you run "terraform init" in the future.
Terraform has been successfully initialized!
```

**Note:** No lock file yet, so init picks the newest version that matches the constraint and writes the lock file.

## Step 3

**Command**

```sh
cat .terraform.lock.hcl
```

**Output**

```text
# This file is maintained automatically by "terraform init".
# Manual edits may be lost in future updates.

provider "registry.terraform.io/hashicorp/local" {
  version     = "2.9.1"
  constraints = "~> 2.9"
  hashes = [
    "h1:qGLHCuYSus+uHNnoEL4SuJqOs5yrNOcB7gnuHoVqizo=",
    "zh:25606c7a5e308144fb627f6e31611bb52ff72bb9ae2d27af39673ab1a6b3c1bf",
    ... 12 more hash lines, folded here
  ]
}
```

**Note:** Read three things: the exact version, the constraints line (the rule it was chosen under; missing when the configuration set none) and the checksums.

## Step 4

**Command**

```sh
(a copy of the folder with the constraint "= 2.8.0")  terraform init
```

**Output**

```text
- Finding hashicorp/local versions matching "2.8.0"...
- Installing hashicorp/local v2.8.0...
- Installed hashicorp/local v2.8.0 (signed by HashiCorp)
lock file now says: version 2.8.0, constraints "2.8.0"
```

**Note:** This stands in for a lock file somebody committed a while ago. Its version is older than the newest one.

## Step 5

**Command**

```sh
cp main.tf old/main.tf   (your constraint; the old lock file stays)   then: terraform init
```

**Output**

```text
Initializing the backend...
Initializing provider plugins...
- Reusing version 2.8.0 of hashicorp/local from the dependency lock file
Error: Failed to query available provider packages
Could not retrieve the list of available versions for provider
hashicorp/local: locked provider registry.terraform.io/hashicorp/local 2.8.0
does not match configured version constraint ~> 2.9; must use terraform init
-upgrade to allow selection of new versions
[exit code 1]
```

**Note:** The lock file wins over the new constraint. init stops and names the way out: -upgrade.

## Step 6

**Command**

```sh
terraform init -upgrade
```

**Output**

```text
Initializing the backend...
Initializing provider plugins...
- Finding hashicorp/local versions matching "~> 2.9"...
- Installing hashicorp/local v2.9.1...
- Installed hashicorp/local v2.9.1 (signed by HashiCorp)
Terraform has made some changes to the provider dependency selections recorded
in the .terraform.lock.hcl file. Review those changes and commit them to your
version control system if they represent changes you intended to make.
Terraform has been successfully initialized!
lock file now says: version 2.9.1, constraints "~> 2.9"
```

**Note:** -upgrade is the one command that moves a locked version. Read the new lock file and commit it on purpose, in its own change.

## Step 7

**Command**

```sh
terraform providers lock -platform=linux_amd64 -platform=darwin_arm64 -platform=windows_amd64
```

**Output**

```text
- Fetching hashicorp/local 2.9.1 for linux_amd64...
- Retrieved hashicorp/local 2.9.1 for linux_amd64 (signed by HashiCorp)
- Fetching hashicorp/local 2.9.1 for darwin_arm64...
- Retrieved hashicorp/local 2.9.1 for darwin_arm64 (signed by HashiCorp)
- Fetching hashicorp/local 2.9.1 for windows_amd64...
- Retrieved hashicorp/local 2.9.1 for windows_amd64 (signed by HashiCorp)
- Obtained hashicorp/local checksums for windows_amd64; Additional checksums for this platform are now tracked in the lock file
- Obtained hashicorp/local checksums for linux_amd64; All checksums for this platform were already tracked in the lock file
- Obtained hashicorp/local checksums for darwin_arm64; Additional checksums for this platform are now tracked in the lock file
Success! Terraform has updated the lock file.
lock file now holds 3 h1 checksum(s) and 13 zh checksum(s)
```

**Note:** init only records the checksum for the platform it ran on. providers lock fetches the others, so a Mac, a Windows laptop and a Linux CI runner all accept the same committed lock file.

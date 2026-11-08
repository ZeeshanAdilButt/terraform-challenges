# Results: Challenge 7, part 2: version a module with Git tags

Recorded run. Machine: win32, runner docker, Terraform 1.17.1 in the pinned image, Git 2.51.0.windows.1, Node 22.22.2. Date: 2026-11-08.

## Step 1

**Command**

```sh
git log --oneline --decorate  (in work/modrepo)
```

**Output**

```text
df33c59 (HEAD -> main, tag: v2.0.0) Release 2.0.0
7263b2c (tag: v1.1.0) Release 1.1.0
1300d46 (tag: v1.0.0) Release 1.0.0
```

**Note:** A repository with three releases. The default branch, main, ends at the newest one: 2.0.0.

## Step 2

**Command**

```sh
terraform init
```

**Output**

```text
Initializing modules...
Downloading git::file:///work/modrepo?ref=v1.1.0 for app...
- app in .terraform/modules/app
Terraform has been successfully initialized!
```

**Note:** init fetched the module from the repository at the ref you chose (v1.1.0). source   = "git::file:///work/modrepo?ref=v1.1.0"

## Step 3

**Command**

```sh
terraform plan -out=tfplan
```

**Output**

```text
Plan: 5 to add, 0 to change, 0 to destroy.
```

**Note:** The module at this ref accepts what the caller passes.

## Step 4

**Command**

```sh
terraform apply tfplan
```

**Output**

```text
Apply complete! Resources: 5 added, 0 changed, 0 destroyed.
```

**Note:** Two containers, built from the pinned module.

## Step 5

**Command**

```sh
cat .terraform/modules/modules.json   (the Key, Source and Dir of the module)
```

**Output**

```text
{
  "Key": "app",
  "Source": "git::file:///work/modrepo?ref=v1.1.0",
  "Dir": ".terraform/modules/app"
}
```

**Note:** This is what init pins: the source string, including the ref. It stores no commit hash and no checksum. The .terraform folder is not committed; the ref in main.tf is the only pin there is.

## Step 6

**Command**

```sh
terraform destroy -auto-approve
```

**Output**

```text
Destroy complete! Resources: 5 destroyed.
```

**Note:** The module version is not part of what destroy removes: only the containers and networks.

## Step 7

**Command**

```sh
ref=v1.0.0: terraform init, terraform apply -auto-approve
```

**Output**

```text
Apply complete! Resources: 5 added, 0 changed, 0 destroyed.
```

**Note:** The starting point: version 1.0.0 is installed and applied.

## Step 8

**Command**

```sh
change ?ref=v1.0.0 to ?ref=v1.1.0, then terraform plan (no init)
```

**Output**

```text
Error: Module source has changed
  on main.tf line 38, in module "app":
  38:   source   = "git::file:///work/modrepo?ref=v1.1.0"
The source address was changed since this module was installed. Run
"terraform init" to install all modules required by this configuration.
```

**Note:** A changed source is not picked up on its own. Terraform asks for init.

## Step 9

**Command**

```sh
terraform init, then terraform plan -detailed-exitcode
```

**Output**

```text
Downloading git::file:///work/modrepo?ref=v1.1.0 for app...
No changes. Your infrastructure matches the configuration.
```

**Note:** A backwards compatible release: new optional input, new output. Plan exit code 0 (0 = nothing to do).

## Step 10

**Command**

```sh
?ref=v2.0.0 and the old argument memory_mb: terraform init
```

**Output**

```text
Error: Unsupported argument
  on main.tf line 45, in module "app":
  45:   memory_mb    = each.value.memory_mb
An argument named "memory_mb" is not expected here.
```

**Note:** A breaking release: memory_mb was renamed memory_limit_mb. Terraform reads the module at init and refuses the old argument. The caller must change before it can use 2.0.0.

## Step 11

**Command**

```sh
rename the argument to memory_limit_mb, then terraform init and terraform plan -detailed-exitcode
```

**Output**

```text
No changes. Your infrastructure matches the configuration.
```

**Note:** The resources are the same, so the upgrade changes nothing. Exit code 0.

## Step 12

**Command**

```sh
add  version = "~> 1.0"  to the module block with the git:: source, then terraform init
```

**Output**

```text
Error: Invalid registry module source address
  on main.tf line 39, in module "app":
  39:   source   = "git::file:///work/modrepo?ref=v1.1.0"
Failed to parse module registry address: a module registry source address
must have either three or four slash-separated components.
Terraform assumed that you intended a module registry source address because
you also set the argument "version", which applies only to registry modules.
```

**Note:** A version constraint works only for registry modules. A Git source has refs, not versions: the tag is the pin.

## Step 13

**Command**

```sh
git tag -f v1.1.0 <the commit of v2.0.0>, then terraform init, then terraform plan
```

**Output**

```text
plan before the tag moved: exit code 0
Initializing modules...
Terraform has been successfully initialized!
No changes. Your infrastructure matches the configuration.
```

**Note:** Someone moved the tag. A plain init sees the same source string, keeps the copy it already has, and the plan still passes. Nothing warns you.

## Step 14

**Command**

```sh
terraform init -upgrade
```

**Output**

```text
Error: Unsupported argument
  on main.tf line 45, in module "app":
  45:   memory_mb    = each.value.memory_mb
An argument named "memory_mb" is not expected here.
```

**Note:** init -upgrade fetches the module again, and now v1.1.0 is the breaking code. The next engineer, or a CI runner with a fresh checkout, gets this.

## Step 15

**Command**

```sh
?ref=<the commit id of the first v1.1.0>, then terraform init -upgrade and terraform plan
```

**Output**

```text
ref = dbaaa8700863...
No changes. Your infrastructure matches the configuration.
```

**Note:** A commit id cannot be moved. It is the strictest pin a Git source offers.

## Step 16

**Command**

```sh
terraform destroy -auto-approve  (the demo caller)
```

**Output**

```text
Destroy complete! Resources: 5 destroyed.
```

**Note:** Everything the demo made is gone.

## Step 17

**Command**

```sh
node toolkit/cleanup.mjs 7
```

**Output**

```text
Still labelled tfc.challenge=7: 0 containers, 0 networks, 0 volumes.
```

**Note:** Everything this part made is gone.

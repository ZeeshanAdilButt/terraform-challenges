# Results: Challenge 9, part 2: ephemeral resources and write-only attributes

Recorded run. Machine: win32, runner docker, Terraform 1.17.1 in the pinned image, Node 22.22.2. Date: 2026-11-08.

## Step 1

**Command**

```sh
terraform init
```

**Output**

```text
Terraform has been successfully initialized!
```

**Note:** init downloads the random and local providers.

## Step 2

**Command**

```sh
terraform plan -out=tfplan, then count the lines of runs.log
```

**Output**

```text
ephemeral.random_password.db: Opening...
ephemeral.random_password.db: Opening complete after 0s
ephemeral.local_command.store: Opening...
ephemeral.local_command.store: Opening complete after 0s
ephemeral.random_password.db: Closing...
ephemeral.local_command.store: Closing...
ephemeral.local_command.store: Closing complete after 0s
ephemeral.random_password.db: Closing complete after 0s
Plan: 1 to add, 0 to change, 0 to destroy.
times the store command has run: 1
```

**Note:** Ephemeral resources are opened in every phase, plan included, when their inputs are known. A command with side effects runs at plan time too.

## Step 3

**Command**

```sh
terraform apply tfplan, then count the lines of runs.log
```

**Output**

```text
Apply complete! Resources: 1 added, 0 changed, 0 destroyed.
times the store command has run: 2
```

**Note:** The store command ran again during apply. An ephemeral value is read anew in each phase.

## Step 4

**Command**

```sh
search the generated password in vault.out, terraform.tfstate, terraform show -json, and a second plan saved with -out
```

**Output**

```text
vault.out holds it (the consumer received it): YES
terraform.tfstate: no
terraform show -json: no
terraform show -json of a saved plan: no
```

**Note:** The consumer got the password. State, show and the saved plan never saw it.

## Step 5

**Command**

```sh
use the ephemeral password as the content of a local_file, then terraform plan
```

**Output**

```text
Error: Invalid use of ephemeral value
  with local_file.leak,
  on main.tf line 14, in resource "local_file" "leak":
  14:   content  = ephemeral.random_password.demo.result
Ephemeral values are not valid for "content", because it is not a write-only
attribute and must be persisted to state.
```

**Note:** Terraform refuses. A normal attribute is saved in state, so an ephemeral value cannot go there. Only a write-only attribute or another ephemeral resource can take it.

## Step 6

**Command**

```sh
terraform providers schema -json, counting attributes with write_only = true  (random, local, null, time, docker, and the built-in terraform provider)
```

**Output**

```text
providers scanned: 6
write-only attributes found: 0
ephemeral resources found: 3 (local_command, random_bytes, random_password)
```

**Note:** None of the providers this course uses has a write-only attribute. Write-only attributes need a provider that offers them; with these five, an ephemeral value can go to another ephemeral resource, as here.

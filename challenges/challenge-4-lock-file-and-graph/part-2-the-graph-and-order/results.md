# Results: Challenge 4, part 2: the graph and the order

Recorded run. Machine: win32, reference solution, Node 22.22.2, TFC_MODE=docker. Date: 2026-11-08.

## Step 1

**Command**

```sh
terraform validate     (in cycle/)
```

**Output**

```text
Error: Cycle:
  terraform_data.a
  terraform_data.b
[exit code 1]
```

**Note:** A resource cannot wait for something that waits for it. Terraform finds this before it touches anything.

## Step 2

**Command**

```sh
terraform graph     (original ordering/main.tf, edges only)
```

**Output**

```text
terraform_data.seed needs terraform_data.migrate
```

**Note:** One edge: seed needs migrate, because seed reads migrate's id. Nothing says migrate needs the database. "A needs B" means B is built first.

## Step 3

**Command**

```sh
terraform apply -auto-approve     (original, default parallelism of 10)
```

**Output**

```text
terraform_data.migrate: Creating...
terraform_data.migrate: Creation complete after 0s [id=bb31b9a7-9c89-39f3-b923-4117f704a801]
terraform_data.seed: Creating...
terraform_data.seed: Creation complete after 0s [id=e7a22212-a4bc-1164-7895-cc7a16137f34]
time_sleep.database_ready: Creating...
time_sleep.database_ready: Creation complete after 2s [id=2026-11-08T18:25:30Z]
```

**Note:** The migrations finished before the database was ready. No error, no warning, and the plan looked fine: with no edge, Terraform starts both at once (up to 10 at a time) and the 2 second wait does not hold migrate back.

## Step 4

**Command**

```sh
terraform graph     (your ordering/main.tf, edges only)
```

**Output**

```text
terraform_data.migrate needs time_sleep.database_ready
terraform_data.seed needs terraform_data.migrate
```

**Note:** Now migrate needs the database. depends_on adds an edge, like a reference does, without passing a value.

## Step 5

**Command**

```sh
terraform apply -auto-approve -parallelism=1     (yours)
```

**Output**

```text
time_sleep.database_ready: Creating...
time_sleep.database_ready: Creation complete after 2s [id=2026-11-08T18:26:11Z]
terraform_data.migrate: Creating...
terraform_data.migrate: Creation complete after 0s [id=597509ae-31b0-88b7-0675-894adbca4026]
terraform_data.seed: Creating...
terraform_data.seed: Creation complete after 0s [id=2919e1e7-d1b5-94df-671b-f23872c75e99]
```

**Note:** Every "needs" line above is respected: the thing needed completes before the thing that needs it starts.

## Step 6

**Command**

```sh
terraform destroy -auto-approve -parallelism=1     (yours)
```

**Output**

```text
terraform_data.seed: Destroying... [id=2919e1e7-d1b5-94df-671b-f23872c75e99]
terraform_data.seed: Destruction complete after 0s
terraform_data.migrate: Destroying... [id=597509ae-31b0-88b7-0675-894adbca4026]
terraform_data.migrate: Destruction complete after 0s
time_sleep.database_ready: Destroying... [id=2026-11-08T18:26:11Z]
time_sleep.database_ready: Destruction complete after 0s
```

**Note:** Destroy runs the same graph backwards: what needs something is removed before the thing it needs.

## Step 7

**Command**

```sh
terraform plan     (original reads/main.tf, no file yet)
```

**Output**

```text
data.local_file.settings: Reading...
Plan: 1 to add, 0 to change, 0 to destroy.
Error: Read local file data source error
The file at given path cannot be read.
+Original Error: open ./out/settings.txt: no such file or directory
[exit code 1]
```

**Note:** Nothing links the data source to the resource that writes the file, so Terraform reads it during the plan. The file is not there yet.

## Step 8

**Command**

```sh
terraform plan, then terraform apply -auto-approve     (yours)
```

**Output**

```text
  # data.local_file.settings will be read during apply
Plan: 1 to add, 0 to change, 0 to destroy.
  + settings = (known after apply)
local_file.settings: Creating...
local_file.settings: Creation complete after 0s [id=320b23c8947f1d6bc6620b342749f10bb3648321]
data.local_file.settings: Reading...
data.local_file.settings: Read complete after 0s [id=320b23c8947f1d6bc6620b342749f10bb3648321]
Apply complete! Resources: 1 added, 0 changed, 0 destroyed.
settings = <<EOT
[plan exit code 0, apply exit code 0]
```

**Note:** With depends_on the read waits: the plan says "read during apply", and the apply reads the file after it is written.

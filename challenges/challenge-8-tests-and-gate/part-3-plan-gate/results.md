# Results: Challenge 8, part 3: a plan gate

Recorded run. Machine: win32, runner docker, Terraform 1.17.1 in the pinned image, Node 22.22.2. Date: 2026-11-08.

## Step 1

**Command**

```sh
terraform init
```

**Output**

```text
- Finding kreuzwerker/docker versions matching "~> 4.6"...
- Installing kreuzwerker/docker v4.6.0...
- Installed kreuzwerker/docker v4.6.0 (self-signed, key ID 0DCE698927DAF8EC)
Terraform has been successfully initialized!
```

**Note:** init downloads the Docker provider.

## Step 2

**Command**

```sh
terraform apply -auto-approve
```

**Output**

```text
docker_image.alpine: Creation complete after 2s [id=sha256:469c9ea410b9215eaee7976ba6c0639039b444be8e5d638f7abbada189971eb2alpine:3.23]
docker_network.app: Creation complete after 3s [id=...]
docker_container.db[0]: Creation complete after 3s [id=...]
docker_container.web: Creation complete after 3s [id=...]
Apply complete! Resources: 4 added, 0 changed, 0 destroyed.
```

**Note:** The stack: image, network, the database (tagged protected) and a web container.

## Step 3

**Command**

```sh
terraform plan -out=gate.tfplan -var web_name=tfc-c8-web2  then  terraform show -json gate.tfplan | node gate.mjs
```

**Output**

```text
Plan: 1 to add, 0 to change, 1 to destroy.
gate: ok, 4 resource changes, none removes a protected resource.
gate exit code: 0
```

**Note:** The web container is not protected. Replacing it is allowed.

## Step 4

**Command**

```sh
terraform plan -out=gate.tfplan -var db_name=tfc-c8-db2  then  terraform show -json gate.tfplan | node gate.mjs
```

**Output**

```text
Plan: 1 to add, 0 to change, 1 to destroy.
BLOCKED: docker_container.db[0] would be delete then create, and it is tagged protected.
gate exit code: 1
```

**Note:** Renaming the database replaces it: the old one is destroyed. The gate must refuse.

## Step 5

**Command**

```sh
terraform plan -out=gate.tfplan -var with_db=false  then  terraform show -json gate.tfplan | node gate.mjs
```

**Output**

```text
Plan: 0 to add, 0 to change, 1 to destroy.
BLOCKED: docker_container.db[0] would be delete, and it is tagged protected.
gate exit code: 1
```

**Note:** with_db = false removes the database. The gate must refuse.

## Step 6

**Command**

```sh
terraform plan -var web_memory_mb=200
```

**Output**

```text
Plan: 0 to add, 1 to change, 0 to destroy.
Warning: Check block assertion failed
web_memory_mb is above 128. This stack is meant to stay small.
exit code: 0
```

**Note:** A check block reports a warning and the plan carries on. It cannot stop anything.

## Step 7

**Command**

```sh
terraform plan -out=pre.tfplan -var db_memory_mb=8
```

**Output**

```text
Error: Resource precondition failed
  on main.tf line 89, in resource "docker_container" "db":
  89:       condition     = var.db_memory_mb >= 32
    ├────────────────
    │ var.db_memory_mb is 8
db_memory_mb must be at least 32: the database needs room to start.
exit code: 1; plan file written: true
```

**Note:** A precondition stops the plan with an error. Terraform still writes the plan file. Look at it next.

## Step 8

**Command**

```sh
terraform show -json pre.tfplan  (the field "errored"), then terraform apply pre.tfplan
```

**Output**

```text
"errored": true
Error: Cannot apply incomplete plan
Terraform encountered an error when generating this plan, so it cannot be
applied.
```

**Note:** The plan file of a failed plan says errored: true, and apply refuses it. A gate that only looks for destroy actions would read this file and find nothing wrong: it must refuse errored plans too.

## Step 9

**Command**

```sh
terraform plan -policies=./policies   (an empty policies folder)
```

**Output**

```text
Error: Failed to connect to policy engine
Failed to connect to policy engine: failed to connect to plugin: exec:
"tfpolicy-plugin": executable file not found in $PATH.
exit code: 0
```

**Note:** In 1.17.1 the flag exists, but the policy engine is a separate program, tfpolicy-plugin, that the official image does not contain. The plan is printed, the error comes after it, and the exit code is still 0: a pipeline that only checks the exit code would pass. Terraform Policy cannot be run from this toolkit. The gate script does the same job with no extra program.

## Step 10

**Command**

```sh
terraform destroy -auto-approve
```

**Output**

```text
Destroy complete! Resources: 4 destroyed.
```

**Note:** Destroy has no gate here: the gate reads a plan, and this is run by hand. A pipeline would plan the destroy first and show the plan to the gate the same way.

## Step 11

**Command**

```sh
node toolkit/cleanup.mjs 8
```

**Output**

```text
Still labelled tfc.challenge=8: 0 containers, 0 networks, 0 volumes.
```

**Note:** Everything this part made is gone. The alpine image stays.

# Results: Challenge 13, part 2: a failed apply and the way back

Recorded run. Machine: Windows 11, Docker Desktop, Engine 29.9.2, Terraform v1.17.1 (docker mode), Node 22.22.2. Date: 2026-11-08.

## Step 1

**Command**

```sh
terraform apply -auto-approve   (the ORIGINAL main.tf: "first" and "second" both publish host port 8841)
```

**Output**

```text
docker_network.net: Creating...
docker_network.net: Creation complete after 2s [id=87b06eaa9fc0cb218260739622078c1b67bf5f5689b1d6a9ea555a2edf665639]
docker_container.first: Creating...
docker_container.first: Creation complete after 4s [id=30677eca61a14de8368675b391b43fc02989416f7c2542f1d9b13a0001cf44fa]
docker_container.second: Creating...
Error: Unable to start container: Error response from daemon: failed to set up container networking: driver failed programming external connectivity on endpoint tfc-c13-second (5dfcbe32885915a353d44878f2b3abd6387c49c42f7eee0d5a6efd6aeb8dacc2): Bind for 127.0.0.1:8841 failed: port is already allocated
  with docker_container.second,
  on main.tf line 44, in resource "docker_container" "second":
  44: resource "docker_container" "second" {
exit code 1
```

**Note:** Terraform built the network and "first". "second" failed, and "third" was never tried. The apply stopped, and what it had built stays built.

## Step 2

**Command**

```sh
terraform state list ; docker ps -a ; terraform plan   (still the broken main.tf)
```

**Output**

```text
docker_container.first
docker_container.second
docker_network.net
tfc-c13-first   running
tfc-c13-second  created
tfc-c13-third   does not exist
  # docker_container.second is tainted, so must be replaced
  # docker_container.third will be created
Plan: 2 to add, 0 to change, 1 to destroy.
```

**Note:** Three kinds of truth now disagree: the state has two containers, Docker has two containers (one only "created", never started), and the plan wants to replace "second". Read all three before you touch anything.

## Step 3

**Command**

```sh
terraform plan   (your main.tf, same folder, same state)
```

**Output**

```text
  # docker_container.second is tainted, so must be replaced
  # docker_container.third will be created
Plan: 2 to add, 0 to change, 1 to destroy.
```

**Note:** Fixing the file is half the recovery. The plan shows the other half: the half-built container is replaced, the missing one is created, and "first" is left alone.

## Step 4

**Command**

```sh
terraform apply -auto-approve ; terraform state list ; docker ps -a
```

**Output**

```text
Apply complete! Resources: 2 added, 0 changed, 1 destroyed.
docker_container.first
docker_container.second
docker_container.third
docker_network.net
tfc-c13-first   running
tfc-c13-second  running
tfc-c13-third   running
"first" id 30677eca61a1... -> 30677eca61a1...
```

**Note:** All three containers run. The healthy container "first" was never touched: the apply picks up where the failure stopped.

## Step 5

**Command**

```sh
terraform plan -replace=docker_container.first ; terraform apply -replace=docker_container.first
```

**Output**

```text
  # docker_container.first will be replaced, as requested
Plan: 1 to add, 0 to change, 1 to destroy.
Apply complete! Resources: 1 added, 0 changed, 1 destroyed.
"first" id 30677eca61a1... -> 7f093edad771...
```

**Note:** -replace asks for a new object even when Terraform thinks the old one is fine. It is the tool for "this container is up but wrong". It replaces what you name and nothing else.

## Step 6

**Command**

```sh
terraform plan   (a run was killed in the middle of an apply and never released the lock)
```

**Output**

```text
(state on the http server: init and apply ok)
LOCK answered 200
Error: Error acquiring the state lock
Lock Info:
ID:        b5e1c0de-2d6a-4a63-9d2c-5f0f6c7e8a11
Path:
Operation: OperationTypeApply
Who:       ci-runner@build-7
Version:   1.17.1
Created:   2026-11-08 17:51:25.163 +0000 UTC
```

**Note:** The error names the lock: its ID, who took it, when, and with which version. That is the information the runbook starts from.

## Step 7

**Command**

```sh
terraform force-unlock -force <ID> ; terraform plan
```

**Output**

```text
lock held before: true
Terraform state has been successfully unlocked!
The state has been unlocked, and Terraform commands should now be able to
lock held after: false
No changes. Your infrastructure matches the configuration.
```

**Note:** Runbook, in this order: 1. Find out who holds the lock and whether that run is still alive (CI page, the person). 2. Only if it is dead, run force-unlock with the ID from the error. 3. Run a plan before the next apply. force-unlock on a live run lets two applies write the same state.

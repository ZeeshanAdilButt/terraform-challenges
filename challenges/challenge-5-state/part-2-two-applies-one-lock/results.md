# Results: Challenge 5, part 2: two applies, one lock

Recorded run. Machine: win32, reference solution, Node 22.22.2, TFC_MODE=docker. Date: 2026-11-08.

## Step 1

**Command**

```sh
terraform init -backend-config=backend.hcl     (original backend.hcl: an address, no lock addresses)
```

**Output**

```text
Successfully configured the backend "http"! Terraform will automatically
```

**Note:** The state is kept on the state server. Nothing here says the state can be locked.

## Step 2

**Command**

```sh
alice and bob each run terraform apply -auto-approve, bob 4 seconds after alice     (original)
```

**Output**

```text
first apply:  Apply complete! Resources: 1 added, 0 changed, 0 destroyed.
second apply: Apply complete! Resources: 1 added, 0 changed, 0 destroyed.
lock requests that reached the server: 0
```

**Note:** Both applies ran, both created the resource from the same empty state, and the last one to finish overwrote the state of the other. Nobody was told.

## Step 3

**Command**

```sh
terraform init -backend-config=backend.hcl     (your backend.hcl)
```

**Output**

```text
Successfully configured the backend "http"! Terraform will automatically
```

**Note:** Same server, a different state name. Does your backend.hcl have lock_address and unlock_address?

## Step 4

**Command**

```sh
(while the apply of alice runs) what the state server holds as the lock
```

**Output**

```text
ID: a828b084-1c07-3510-bcdd-d9424f7c11c4
Operation: OperationTypeApply
Info: 
Who: root@bec686598a6b
Version: 1.17.1
Created: 2026-11-08T17:47:55.223395037Z
Path:
```

**Note:** The lock is a small record: who, what, since when. Terraform took it by itself, before it read the state.

## Step 5

**Command**

```sh
terraform apply -auto-approve     (bob, while alice runs)
```

**Output**

```text
Error: Error acquiring the state lock
Error message: HTTP remote state already locked:
ID=a828b084-1c07-3510-bcdd-d9424f7c11c4
Lock Info:
  ID:        a828b084-1c07-3510-bcdd-d9424f7c11c4
  Path:
  Operation: OperationTypeApply
  Who:       root@bec686598a6b
  Version:   1.17.1
  Created:   2026-11-08 17:47:55.223395037 +0000 UTC
  Info:
Terraform acquires a state lock to protect the state from being written
by multiple users at the same time. Please resolve the issue above and try
again. For most commands, you can disable locking with the "-lock=false"
flag, but this is not recommended.
[exit code 1]
```

**Note:** Refused before it read or changed anything. The error names the lock, who holds it, since when, and its ID.

## Step 6

**Command**

```sh
terraform apply -auto-approve -lock-timeout=5s     (bob again, alice still running)
```

**Output**

```text
Acquiring state lock. This may take a few moments...
Error: Error acquiring the state lock
Error message: HTTP remote state already locked:
[exit code 1, took 10.6 s including the container start]
```

**Note:** With -lock-timeout Terraform keeps retrying for that long, then gives up with the same error. The default is 0s: give up at once.

## Step 7

**Command**

```sh
terraform apply -auto-approve -lock-timeout=120s     (bob again, alice still running)
```

**Output**

```text
Acquiring state lock. This may take a few moments...
No changes. Your infrastructure matches the configuration.
Apply complete! Resources: 0 added, 0 changed, 0 destroyed.
[exit code 0, waited 26.2 s]
```

**Note:** It waited until the first apply released the lock, then ran. It found the resource already there, so it changed nothing. A pipeline that must not fail on a busy lock uses a timeout.

## Step 8

**Command**

```sh
(the apply of alice, at the end)
```

**Output**

```text
time_sleep.slow: Creating...
time_sleep.slow: Still creating... [00m10s elapsed]
time_sleep.slow: Still creating... [00m20s elapsed]
time_sleep.slow: Creation complete after 25s [id=2026-11-08T17:48:23Z]
Apply complete! Resources: 1 added, 0 changed, 0 destroyed.
```

**Note:** The first apply was never disturbed. The lock is released when it ends.

## Step 9

**Command**

```sh
terraform plan     (a CI job was killed halfway and left its lock behind)
```

**Output**

```text
Error: Error acquiring the state lock
Error message: HTTP remote state already locked:
ID=5b0b3c40-6d3e-4a7e-9f11-0a1b2c3d4e5f
Lock Info:
  ID:        5b0b3c40-6d3e-4a7e-9f11-0a1b2c3d4e5f
  Path:
  Operation: OperationTypeApply
  Who:       ci-runner@build-42
  Version:   1.17.1
  Created:   2026-11-08 17:48:37.336 +0000 UTC
  Info:
Terraform acquires a state lock to protect the state from being written
by multiple users at the same time. Please resolve the issue above and try
again. For most commands, you can disable locking with the "-lock=false"
[exit code 1]
```

**Note:** Nothing is running, yet the lock is held. This is a stale lock. Before you force it open: check that the Who and Created lines really belong to a dead job.

## Step 10

**Command**

```sh
terraform force-unlock -force 5b0b3c40-6d3e-4a7e-9f11-0a1b2c3d4e5f
```

**Output**

```text
Terraform state has been successfully unlocked!
The state has been unlocked, and Terraform commands should now be able to
obtain a new lock on the remote state.
[exit code 0]
```

**Note:** force-unlock takes the ID from the error. It removes the lock. It does not touch your infrastructure and it does not fix a half-written state.

## Step 11

**Command**

```sh
terraform plan
```

**Output**

```text
No changes. Your infrastructure matches the configuration.
```

**Note:** The lock is gone and plans work again.

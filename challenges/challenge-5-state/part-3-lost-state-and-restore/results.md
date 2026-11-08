# Results: Challenge 5, part 3: lost state and restore

Recorded run. Machine: win32, reference solution, Node 22.22.2, TFC_MODE=docker. Date: 2026-11-08.

## Step 1

**Command**

```sh
terraform apply -auto-approve     (day 1: the container)
```

**Output**

```text
docker_container.app: Creating...
docker_container.app: Creation complete after 3s [id=e1247ef55d61363328e0ef39cd32052c73e6e8de15510ca0cd9d64e4bf6a979a]
Apply complete! Resources: 1 added, 0 changed, 0 destroyed.
```

**Note:** The state file terraform.tfstate now holds the container.

## Step 2

**Command**

```sh
terraform apply -auto-approve     (day 2: the container plus a release record)
```

**Output**

```text
terraform_data.release: Creating...
terraform_data.release: Creation complete after 0s [id=df8b2a09-6fa2-73bc-dd7c-e967c53dc97b]
Apply complete! Resources: 1 added, 0 changed, 0 destroyed.
```

**Note:** A second apply. From now on Terraform keeps the state before this apply as terraform.tfstate.backup.

## Step 3

**Command**

```sh
ls terraform.tfstate* ; docker ps --filter label=tfc.challenge=5
```

**Output**

```text
terraform.tfstate          serial 3  docker_container.app, terraform_data.release
terraform.tfstate.backup   serial 1  docker_container.app
container: tfc-c5-app (Up 11 seconds)
```

**Note:** The backup is one apply behind: it does not know the release record. That matters later.

## Step 4

**Command**

```sh
(the state file is deleted by mistake; the backup is copied aside first)  terraform state list ; docker ps
```

**Output**

```text
terraform state list: No state file was found! State management commands require a state file. Run this command in a directory where Terraform has been run or use the -state flag to point the command to a specific state location.
container: tfc-c5-app (Up 17 seconds)
```

**Note:** Terraform remembers nothing. The container still runs: the real world does not care that the state is gone. The copy aside matters, as you will see.

## Step 5

**Command**

```sh
terraform plan
```

**Output**

```text
  # docker_container.app will be created
  # terraform_data.release will be created
Plan: 2 to add, 0 to change, 0 to destroy.
```

**Note:** With no state, Terraform plans to create everything again, including the container that is already there.

## Step 6

**Command**

```sh
terraform apply -auto-approve
```

**Output**

```text
terraform_data.release: Creating...
terraform_data.release: Creation complete after 0s [id=1d3595d5-c87c-93b2-1903-1b5a5170e7b7]
docker_container.app: Creating...
Error: Unable to create container: Error response from daemon: Conflict. The container name "/tfc-c5-app" is already in use by container "e1247ef55d61363328e0ef39cd32052c73e6e8de15510ca0cd9d64e4bf6a979a". You have to remove (or rename) that container to be able to reuse that name.
[exit code 1]
```

**Note:** The apply tries to create a second container with the same name and Docker refuses. The error is the real world telling you the state does not match.

## Step 7

**Command**

```sh
terraform apply -auto-approve -replace=terraform_data.release     (a colleague tries something small)   then: what terraform.tfstate.backup holds
```

**Output**

```text
apply exit code 1
backup after the first failed apply:   docker_container.app
backup after the apply with -replace: terraform_data.release
```

**Note:** The failed applies wrote nothing new, so the first backup survived them. This apply replaced a resource, wrote the state, and so copied the half-written state over the backup. The container is gone from the only backup. Copy the backup aside before anything else touches the folder.

## Step 8

**Command**

```sh
cp ../keep/terraform.tfstate.backup terraform.tfstate ; terraform plan     (recovery A)
```

**Output**

```text
  # terraform_data.release will be created
Plan: 1 to add, 0 to change, 0 to destroy.
```

**Note:** The container is tracked again. The plan wants only the release record, because the backup was taken before day 2 finished. A restored backup is always as old as its last apply.

## Step 9

**Command**

```sh
terraform apply -auto-approve ; terraform plan
```

**Output**

```text
terraform_data.release: Creating...
terraform_data.release: Creation complete after 0s [id=ef3fbb50-4c89-1f25-ad34-381f227391d5]
Apply complete! Resources: 1 added, 0 changed, 0 destroyed.
No changes. Your infrastructure matches the configuration.
```

**Note:** One resource added, then No changes. Recovery A worked, and the container id did not change.

## Step 10

**Command**

```sh
rm terraform.tfstate* ; terraform state list     (the backup is gone too)
```

**Output**

```text
terraform state list: No state file was found! State management commands require a state file. Run this command in a directory where Terraform has been run or use the -state flag to point the command to a specific state location.
container: tfc-c5-app (Up About a minute)
```

**Note:** Worst case: nothing to restore. The container exists, and Terraform can adopt it with import.

## Step 11

**Command**

```sh
terraform import docker_container.app <the container id from docker inspect>
```

**Output**

```text
docker_container.app: Importing from ID "<id>"...
docker_container.app: Import prepared!
Import successful!
```

**Note:** The container is in the state again. import adds one resource and checks nothing: always plan next.

## Step 12

**Command**

```sh
terraform plan     (recovery B, after the import)
```

**Output**

```text
  # docker_container.app will be updated in-place
  # terraform_data.release will be created
Plan: 1 to add, 1 to change, 0 to destroy.
```

**Note:** The plan wants the release record and a harmless in-place update of arguments the provider cannot read back (they carry the lifecycle block: ignore_changes). Nothing is destroyed.

## Step 13

**Command**

```sh
terraform apply -auto-approve ; terraform plan
```

**Output**

```text
docker_container.app: Refreshing state... [id=e1247ef55d61363328e0ef39cd32052c73e6e8de15510ca0cd9d64e4bf6a979a]
terraform_data.release: Creating...
terraform_data.release: Creation complete after 0s [id=cf2c5cfe-3534-dc0e-f16f-25231450fecc]
docker_container.app: Modifying... [id=e1247ef55d61363328e0ef39cd32052c73e6e8de15510ca0cd9d64e4bf6a979a]
docker_container.app: Modifications complete after 0s [id=e1247ef55d61363328e0ef39cd32052c73e6e8de15510ca0cd9d64e4bf6a979a]
Apply complete! Resources: 1 added, 1 changed, 0 destroyed.
No changes. Your infrastructure matches the configuration.
container id unchanged: true
```

**Note:** Adopted without recreating. This is the whole point of import.

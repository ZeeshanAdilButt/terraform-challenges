# Results: Challenge 6, part 2: drift and refresh-only

Recorded run. Machine: win32, reference solution, Node 22.22.2, TFC_MODE=docker. Date: 2026-11-08.

## Step 1

**Command**

```sh
terraform apply -auto-approve
```

**Output**

```text
terraform_data.note: Creation complete after 0s [id=6421bf3e-0eae-f7c7-bcca-c4a7d6d0372b]
docker_container.app: Creation complete after 3s [id=397d852ce3dc8646572eec68ac8452168ce594328f6221e81ab32d90902040b1]
Apply complete! Resources: 2 added, 0 changed, 0 destroyed.
```

**Note:** A container named tfc-c6-app and a small record. Terraform and Docker agree.

## Step 2

**Command**

```sh
terraform plan -detailed-exitcode
```

**Output**

```text
No changes. Your infrastructure matches the configuration.
[exit code 0]   your verdict(): clean
```

**Note:** Exit code 0: nothing to change.

## Step 3

**Command**

```sh
terraform plan -detailed-exitcode -var-file=nope.tfvars
```

**Output**

```text
Error: Failed to read variables file
Given variables file nope.tfvars does not exist.
For more help on using this command, run:
  terraform plan -help
[exit code 1]   your verdict(): error
```

**Note:** Exit code 1: an error. It is not drift, and a job that reports it as drift sends someone to look at the wrong thing.

## Step 4

**Command**

```sh
docker stop tfc-c6-app ; terraform plan -minimal-refresh -detailed-exitcode ; terraform plan -detailed-exitcode
```

**Output**

```text
-minimal-refresh: "Refreshing state" lines: 0   No changes. Your infrastructure matches the configuration.   [exit code 0]
plain plan:       "Refreshing state" lines: 2     # docker_container.app will be updated in-place | Plan: 0 to add, 1 to change, 0 to destroy.   [exit code 2]
```

**Note:** -minimal-refresh (Terraform 1.17) refreshes only the resources that already have a planned change. Here the code and the state agree, so nothing is refreshed and the stop goes unseen: "No changes", exit code 0. A plain plan refreshes everything and sees it. -minimal-refresh is faster on a big state and blind to drift in everything it does not refresh. Use it for quick plans, never for a drift check.

## Step 5

**Command**

```sh
docker start tfc-c6-app ; terraform plan -detailed-exitcode
```

**Output**

```text
No changes. Your infrastructure matches the configuration.
[exit code 0]
```

**Note:** Started again: Terraform and Docker agree, and the next steps begin from a clean plan.

## Step 6

**Command**

```sh
docker rename tfc-c6-app tfc-c6-app-moved ; terraform plan -detailed-exitcode
```

**Output**

```text
  # docker_container.app must be replaced
      + exit_code                                   = (known after apply)
      ~ name                                        = "tfc-c6-app-moved" -> "tfc-c6-app" # forces replacement
Plan: 1 to add, 0 to change, 1 to destroy.
[exit code 2]   your verdict(): changes
```

**Note:** Somebody renamed the container by hand. Terraform reads the real name, sees it differs from the code, and plans to destroy the container and build a new one with the right name. The container is "drifted", and the plan to fix it is a destroy.

## Step 7

**Command**

```sh
terraform plan -refresh-only -detailed-exitcode -out=drift.tfplan ; terraform show -json drift.tfplan
```

**Output**

```text
Note: Objects have changed outside of Terraform
  # docker_container.app has changed
      ~ name                                        = "tfc-c6-app" -> "tfc-c6-app-moved"
This is a refresh-only plan, so Terraform will not take any actions to undo
[exit code 2]
in the JSON: resource_changes has 0 entries, resource_drift has 1
your driftedAddresses(): ["docker_container.app"]
```

**Note:** A refresh-only plan only looks. It shows what changed outside Terraform and plans no action. In the JSON, the drift is under resource_drift, not resource_changes.

## Step 8

**Command**

```sh
terraform apply -refresh-only -auto-approve ; terraform plan -detailed-exitcode
```

**Output**

```text
Apply complete! Resources: 0 added, 0 changed, 0 destroyed.
name in the state file now: "tfc-c6-app-moved"
  # docker_container.app must be replaced
      + exit_code                                   = (known after apply)
      ~ name                                        = "tfc-c6-app-moved" -> "tfc-c6-app" # forces replacement
Plan: 1 to add, 0 to change, 1 to destroy.
[exit code 2]
```

**Note:** apply -refresh-only copies the real world into the state, nothing else. The state now says -moved. The code still says tfc-c6-app, so the plan still wants to destroy and rebuild. Accepting drift is not the same as fixing it.

## Step 9

**Command**

```sh
docker rename tfc-c6-app-moved tfc-c6-app ; terraform plan -detailed-exitcode
```

**Output**

```text
No changes. Your infrastructure matches the configuration.
[exit code 0]
```

**Note:** Putting the real world back (or changing the code to match it) ends the drift. Both are decisions for a person; apply -refresh-only is neither.

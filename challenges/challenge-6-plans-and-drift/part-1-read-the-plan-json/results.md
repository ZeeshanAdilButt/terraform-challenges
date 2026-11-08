# Results: Challenge 6, part 1: read the plan JSON

Recorded run. Machine: win32, reference solution, Node 22.22.2, TFC_MODE=docker. Date: 2026-11-08.

## Step 1

**Command**

```sh
terraform apply -auto-approve     (before/main.tf: what is deployed today)
```

**Output**

```text
Apply complete! Resources: 6 added, 0 changed, 0 destroyed.
```

**Note:** Two containers, one file and three small resources exist now.

## Step 2

**Command**

```sh
terraform plan -out=plan.tfplan     (the pull request's main.tf)
```

**Output**

```text
  # docker_container.web must be replaced
      ~ command                                     = [ # forces replacement
      ~ image                                       = "nginx:1.27-alpine" -> "alpine:3.23" # forces replacement
  # docker_container.worker will be updated in-place
  # local_file.motd must be replaced
      ~ content              = <<-EOT # forces replacement
  # terraform_data.cbd must be replaced
  # terraform_data.newcomer will be created
  # terraform_data.old will be destroyed
  # (because terraform_data.old is not in configuration)
Plan: 4 to add, 1 to change, 4 to destroy.
```

**Note:** The last line says 4 to add, 1 to change, 4 to destroy. It does not say which of those are replacements. The "forces replacement" lines are the clue, and they are in the middle of a long text.

## Step 3

**Command**

```sh
terraform show -json plan.tfplan     (then read resource_changes with Node: address, actions, action_reason)
```

**Output**

```text
docker_container.web       ["delete","create"]  replace_because_cannot_update
docker_container.worker    ["update"]           
local_file.motd            ["delete","create"]  replace_because_cannot_update
terraform_data.cbd         ["create","delete"]  replace_because_cannot_update
terraform_data.newcomer    ["create"]           
terraform_data.old         ["delete"]           delete_because_no_resource_config
terraform_data.same        ["no-op"]
```

**Note:** One entry per resource, and an actions list. A replacement is two actions: ["delete","create"], or ["create","delete"] when create_before_destroy is set. The order is not the same, and both are replacements.

## Step 4

**Command**

```sh
node: run classify() and replaceReasons() from classify.mjs over every change
```

**Output**

```text
ok    docker_container.web       yours: replace  truth: replace  reasons: image, command
ok    docker_container.worker    yours: update   truth: update   reasons: -
ok    local_file.motd            yours: replace  truth: replace  reasons: content
ok    terraform_data.cbd         yours: replace  truth: replace  reasons: triggers_replace
ok    terraform_data.newcomer    yours: create   truth: create   reasons: -
ok    terraform_data.old         yours: delete   truth: delete   reasons: -
ok    terraform_data.same        yours: none     truth: none     reasons: -
```

**Note:** Every change is classified, and every replacement names the attribute that forced it.

## Step 5

**Command**

```sh
terraform plan -replace=terraform_data.same -out=plan2.tfplan ; terraform show -json plan2.tfplan
```

**Output**

```text
  # terraform_data.same will be replaced, as requested
Plan: 5 to add, 1 to change, 5 to destroy.
terraform_data.same  actions ["delete","create"]  action_reason replace_by_request
```

**Note:** Same actions list, but a different reason: replace_by_request. The reason tells you why Terraform wants the replacement: your code, a tainted resource, or a request on the command line.

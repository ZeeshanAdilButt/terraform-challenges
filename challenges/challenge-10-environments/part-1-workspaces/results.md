# Results: Challenge 10, part 1: workspaces on local state

Recorded run. Machine: win32, Docker Desktop, Engine 29.9.2, Terraform v1.17.1 (docker mode), Node 22.22.2. Date: 2026-11-08.

## Step 1

**Command**

```sh
terraform init
```

**Output**

```text
Terraform has been successfully initialized!
```

**Note:** One configuration, one set of providers. Workspaces do not change this part.

## Step 2

**Command**

```sh
terraform workspace list
```

**Output**

```text
* default
```

**Note:** Every folder starts with one workspace, called default. You never created it.

## Step 3

**Command**

```sh
terraform workspace new dev
terraform apply -auto-approve
```

**Output**

```text
Created and switched to workspace "dev"!
docker_container.app: Creating...
docker_container.app: Creation complete after 2s [id=5982e792e1472881d820c3113c88ae8febac667c4e730b284d210751a1185983]
Apply complete! Resources: 2 added, 0 changed, 0 destroyed.
Outputs:
environment = "dev"
```

**Note:** The new workspace starts empty. The apply builds one image resource and one container, and the output says which workspace did it.

## Step 4

**Command**

```sh
terraform workspace new prod
terraform apply -auto-approve
```

**Output**

```text
Created and switched to workspace "prod"!
docker_container.app: Creating...
docker_container.app: Creation complete after 1s [id=3195c73572a060bf52dd5e3a008f3deae104e8c79625f94479e49642d3dd3888]
Apply complete! Resources: 2 added, 0 changed, 0 destroyed.
Outputs:
environment = "prod"
```

**Note:** Same files, a second empty state. Creating the workspace also selected it: you are now in prod.

## Step 5

**Command**

```sh
terraform workspace list
ls -R terraform.tfstate.d
```

**Output**

```text
default
  dev
* prod

terraform.tfstate.d/dev/terraform.tfstate
terraform.tfstate.d/prod/terraform.tfstate
```

**Note:** Local state keeps one file per workspace, in a folder next to your code. The default workspace uses terraform.tfstate in the folder itself. Nothing here is shared, and nobody else is locked out.

## Step 6

**Command**

```sh
docker ps -a --filter label=tfc.challenge=10 --format {{.Names}}
```

**Output**

```text
tfc-c10-p1-dev-app
tfc-c10-p1-prod-app
```

**Note:** The names show the workspace only if the configuration puts terraform.workspace in the name. Containers: 2.

## Step 7

**Command**

```sh
terraform workspace show
terraform plan -var greeting=hello-dev
```

**Output**

```text
prod
  # docker_container.app must be replaced
      ~ env                                         = [ # forces replacement
          - "GREETING=hello",
          + "GREETING=hello-dev",
Plan: 1 to add, 0 to change, 1 to destroy.
```

**Note:** You meant to try the new greeting in dev. The shell is still in prod, because "workspace new prod" selected it. The plan wants to destroy and rebuild the prod container.

## Step 8

**Command**

```sh
terraform apply -auto-approve -var greeting=hello-dev
docker inspect (GREETING of each container)
```

**Output**

```text
Apply complete! Resources: 1 added, 0 changed, 1 destroyed.
tfc-c10-p1-dev-app: GREETING=hello
tfc-c10-p1-prod-app: GREETING=hello-dev
```

**Note:** Prod changed and dev did not. Nothing stopped this: the apply asked no question beyond the flag you gave it.

## Step 9

**Command**

```sh
terraform workspace select default
terraform plan
```

**Output**

```text
Switched to workspace "default".
Error: Resource precondition failed
  on main.tf line 40, in resource "docker_container" "app":
  40:       condition     = contains(["dev", "prod"], terraform.workspace)
    ├────────────────
    │ terraform.workspace is "default"
The workspace "default" is not allowed. Run: terraform workspace select dev
(or prod).
```

**Note:** A precondition on the container refuses any workspace that is not dev or prod. The default workspace cannot be applied by accident.

## Step 10

**Command**

```sh
terraform workspace delete dev
```

**Output**

```text
Error: Workspace is not empty
Workspace "dev" is currently tracking the following resource instances:
  - docker_container.app
  - docker_image.alpine
Deleting this workspace would cause Terraform to lose track of any
associated remote objects, which would then require you to delete them
manually outside of Terraform. You should destroy these objects with
Terraform before deleting the workspace.
If you want to delete this workspace anyway, and have Terraform forget
about these managed objects, use the -force option to disable this safety
check.
```

**Note:** Terraform refuses to forget a workspace that still tracks objects. Deleting the state would orphan the container.

## Step 11

**Command**

```sh
for each of dev and prod: terraform workspace select <it>, terraform destroy -auto-approve,
then terraform workspace select default and terraform workspace delete <it>
```

**Output**

```text
dev: Destroy complete! Resources: 2 destroyed. | Deleted workspace "dev"!
prod: Destroy complete! Resources: 2 destroyed. | Deleted workspace "prod"!
* default
```

**Note:** The safe order is select, destroy, switch away, delete. Only then does the workspace disappear.

## Step 12

**Command**

```sh
docker ps -a, docker network ls, docker volume ls  (filter label=tfc.challenge=10)
```

**Output**

```text
0 containers, 0 networks, 0 volumes
```

**Note:** Everything this part built is gone.

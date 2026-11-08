# Results: Challenge 11, part 1: plan on pull request

Recorded run. Machine: win32, Docker Desktop, Engine 29.9.2, Terraform v1.17.1 (docker mode), Node 22.22.2. Date: 2026-11-08.

## Step 1

**Command**

```sh
node ci/plan.mjs infra
cat infra/plan.md
```

**Output**

```text
[1/5] terraform init -input=false ... ok (Ns)
[2/5] terraform validate ... ok (Ns)
[3/5] terraform fmt -check -diff -recursive ... ok (Ns)
[4/5] terraform plan -input=false -out=plan.tfplan ... ok (Ns)
[5/5] terraform show -json plan.tfplan ... ok (Ns)
Wrote plan.tfplan and plan.md

## Terraform plan for `infra`

**Plan: 3 to add, 0 to change, 0 to destroy.**

| Resource | Action |
|---|---|
| `docker_container.db` | create |
| `docker_image.alpine` | create |
| `docker_volume.data` | create |
```

**Note:** Five steps in a fixed order, then a Markdown file. The workflow posts that file as the comment on the pull request.

## Step 2

**Command**

```sh
terraform apply plan.tfplan
node ci/plan.mjs infra
cat infra/plan.md
```

**Output**

```text
Apply complete! Resources: 3 added, 0 changed, 0 destroyed.
[1/5] terraform init -input=false ... ok (Ns)
[2/5] terraform validate ... ok (Ns)
[3/5] terraform fmt -check -diff -recursive ... ok (Ns)
[4/5] terraform plan -input=false -out=plan.tfplan ... ok (Ns)
[5/5] terraform show -json plan.tfplan ... ok (Ns)
Wrote plan.tfplan and plan.md

## Terraform plan for `infra`

**No changes.**
```

**Note:** Applied once. The next pull request that changes nothing says so in one line.

## Step 3

**Command**

```sh
edit infra/main.tf: default = "fast"
node ci/plan.mjs infra
cat infra/plan.md
```

**Output**

```text
[1/5] terraform init -input=false ... ok (Ns)
[2/5] terraform validate ... ok (Ns)
[3/5] terraform fmt -check -diff -recursive ... ok (Ns)
[4/5] terraform plan -input=false -out=plan.tfplan ... ok (Ns)
[5/5] terraform show -json plan.tfplan ... ok (Ns)
Wrote plan.tfplan and plan.md

## Terraform plan for `infra`

**Plan: 1 to add, 0 to change, 1 to destroy.**

| Resource | Action |
|---|---|
| `docker_container.db` | replace |

> **Warning:** this plan destroys 1 resource. A person must read it before it is applied.
```

**Note:** One changed word, and the container must be replaced. The warning line is what a reviewer sees first.

## Step 4

**Command**

```sh
edit infra/main.tf: rename the volume
node ci/plan.mjs infra
cat infra/plan.md
```

**Output**

```text
[1/5] terraform init -input=false ... ok (Ns)
[2/5] terraform validate ... ok (Ns)
[3/5] terraform fmt -check -diff -recursive ... ok (Ns)
[4/5] terraform plan -input=false -out=plan.tfplan ... ok (Ns)
[5/5] terraform show -json plan.tfplan ... ok (Ns)
Wrote plan.tfplan and plan.md

## Terraform plan for `infra`

**Plan: 2 to add, 0 to change, 2 to destroy.**

| Resource | Action |
|---|---|
| `docker_container.db` | replace |
| `docker_volume.data` | replace |

> **Warning:** this plan destroys 2 resources. A person must read it before it is applied.
```

**Note:** A renamed volume is a new, empty volume. The old one, and what is in it, is destroyed. The table lists both resources.

## Step 5

**Command**

```sh
edit infra/main.tf: remove the alignment spaces of one line
node ci/plan.mjs infra
cat infra/plan.md
```

**Output**

```text
[1/5] terraform init -input=false ... ok (Ns)
[2/5] terraform validate ... ok (Ns)
[3/5] terraform fmt -check -diff -recursive ... FAILED (exit 3, 1.6s)
main.tf
--- old/main.tf
+++ new/main.tf
@@ -33,7 +33,7 @@
   image       = docker_image.alpine.image_id
   command     = ["sleep", "3600"]
   env         = ["DB_MODE=${var.db_mode}"]
-  memory = 64
+  memory      = 64
   memory_swap = 64
   volumes {

## Terraform plan for `infra`

**Failed at the fmt step** (exit code 3).
```

**Note:** Formatting is checked before the plan is made. The pipeline stops at the fmt step, with exit code 1, and the comment says where.

## Step 6

**Command**

```sh
edit infra/main.tf: a typo in a variable name
node ci/plan.mjs infra
```

**Output**

```text
[1/5] terraform init -input=false ... ok (Ns)
[2/5] terraform validate ... FAILED (exit 1, 3.7s)
Error: Reference to undeclared input variable
  on main.tf line 35, in resource "docker_container" "db":
  35:   env         = ["DB_MODE=${var.db_modee}"]
An input variable with the name "db_modee" has not been declared. Did you
mean "db_mode"?
```

**Note:** A typo is caught by validate, before fmt and before any plan. Cheap checks first.

## Step 7

**Command**

```sh
grep "uses:" .github/workflows/plan.yml
```

**Output**

```text
pinned  actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
pinned  actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1
pinned  hashicorp/setup-terraform@dfe3c3f87815947d99a8997f908cb6525fc44e9e
```

**Note:** A full 40-character commit SHA cannot be moved. A tag such as v7 can. Each SHA in the reference was checked with: gh api repos/<owner>/<repo>/commits/<tag> -q .sha

## Step 8

**Command**

```sh
cd infra && terraform destroy -auto-approve
```

**Output**

```text
Destroy complete! Resources: 3 destroyed.
```

**Note:** The first apply built three things (an image resource, a volume, a container); the destroy removes them.

## Step 9

**Command**

```sh
docker ps -a, docker network ls, docker volume ls  (filter label=tfc.challenge=11)
```

**Output**

```text
0 containers, 0 networks, 0 volumes
```

**Note:** Everything this part built is gone.

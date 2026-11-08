# Results: Challenge 9, part 3: keeping logs clean

Recorded run. Machine: win32, runner docker, Terraform 1.17.1 in the pinned image, Node 22.22.2. Date: 2026-11-08.

## Step 1

**Command**

```sh
CI build of your main.tf: terraform plan, terraform apply, then  node ci.mjs --secret-env API_TOKEN logs/plan.txt logs/plan.json logs/apply.txt terraform.tfstate
```

**Output**

```text
what is really in each file (plain text search by run.mjs):
  logs/plan.txt      no
  logs/plan.json     no
  logs/apply.txt     no
  terraform.tfstate  no
what ci.mjs said:
  ci: ok, 4 file(s) scanned, no secret found.
ci exit code: 0
```

**Note:** Green, and the files are really clean.

## Step 2

**Command**

```sh
CI build of fixtures/leaky (a stack known to leak): terraform plan, terraform apply, then  node ci.mjs --secret-env API_TOKEN logs/plan.txt logs/plan.json logs/apply.txt terraform.tfstate
```

**Output**

```text
what is really in each file (plain text search by run.mjs):
  logs/plan.txt      YES
  logs/plan.json     YES
  logs/apply.txt     YES
  terraform.tfstate  YES
what ci.mjs said:
  LEAK: logs/plan.txt:11: API_TOKEN found as plain
  LEAK: logs/plan.txt:18: API_TOKEN found as plain
  LEAK: logs/plan.json:1: API_TOKEN found as plain
  LEAK: logs/apply.txt:8: API_TOKEN found as plain
  LEAK: terraform.tfstate:8: API_TOKEN found as plain
  LEAK: terraform.tfstate:24: API_TOKEN found as plain
  LEAK: terraform.tfstate:28: API_TOKEN found as plain
  ci: build failed, 7 place(s) hold a secret.
ci exit code: 1
```

**Note:** The scanner fails the build on the leaky stack: 4 files hold the token, and ci.mjs reports where. It also finds forms the plain search of this run does not (url, base64) if they appear.

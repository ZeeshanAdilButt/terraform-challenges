# Results: Challenge 14, part 1: define the platform

Recorded run. Machine: win32, Docker Desktop, Engine 29.9.2, Terraform v1.17.1 (docker mode), Node 22.22.2. Date: 2026-11-08.

## Step 1

**Command**

```sh
terraform fmt -check -recursive
```

**Output**

```text
(no output: every file is formatted)
```

**Note:** fmt -check lists the files that are not in the standard format and exits 3. Nothing listed, exit 0. CI runs this on every push.

## Step 2

**Command**

```sh
cd capstone && terraform init -backend=false && terraform test
```

**Output**

```text
  run "outputs_describe_the_platform"... pass
  run "web_is_told_where_the_cache_is"... pass
  run "the_cache_keeps_its_data_on_the_volume"... pass
tests/mock.tftest.hcl... pass
  run "names_follow_the_prefix"... pass
  run "web_is_published_on_loopback_only"... pass
  run "protected_label_follows_the_input"... pass
tests/plan.tftest.hcl... pass
  run "name_without_the_prefix_is_refused"... pass
  run "unknown_environment_is_refused"... pass
  run "privileged_port_is_refused"... pass
  run "memory_out_of_range_is_refused"... pass
  run "latest_tag_is_refused"... pass
tests/validation.tftest.hcl... pass
Success! 11 passed, 0 failed.
```

**Note:** The provider is mocked, so no Docker engine runs. Plan tests, failing-validation tests (expect_failures turns a refusal into a pass) and mock tests: all in about a second each.

## Step 3

**Command**

```sh
node toolkit/state-server.mjs --port 8850   (started from run.mjs with a token for dev and a token for prod)
```

**Output**

```text
State server on port 8850. /state/dev/... needs the dev token, /state/prod/... needs the prod token.
```

**Note:** One server, two separate states, two separate credentials. The tokens are made up for this run and are only ever passed through TF_HTTP_PASSWORD.

## Step 4

**Command**

```sh
cd capstone/envs/dev && terraform init -backend-config=backend.hcl
cd capstone/envs/prod && terraform init -backend-config=backend.hcl
```

**Output**

```text
dev:  Successfully configured the backend "http"! Terraform will automatically
prod: Successfully configured the backend "http"! Terraform will automatically
- Reusing version 4.6.0 of kreuzwerker/docker from the dependency lock file
- Using kreuzwerker/docker v4.6.0 from the shared cache directory
```

**Note:** Two folders, two .terraform directories, two state names (dev/platform and prod/platform). Both call the same module.

## Step 5

**Command**

```sh
terraform validate   (in envs/dev and in envs/prod)
```

**Output**

```text
dev:  Success! The configuration is valid.
prod: Success! The configuration is valid.
```

**Note:** validate checks the syntax and the references, with no state and no Docker.

## Step 6

**Command**

```sh
cd capstone/envs/dev && terraform plan -var memory_mb=4096
```

**Output**

```text
Error: Invalid value for variable
  on main.tf line 62, in module "service":
  62:   memory_mb   = var.memory_mb
    ├────────────────
    │ var.memory_mb is 4096
memory_mb must be between 16 and 256.
This was checked by the validation rule at
../../modules/service/variables.tf:36,3-13.
```

**Note:** The module refuses a memory limit outside 16 to 256 MB before anything is planned, and says where the rule is written.

## Step 7

**Command**

```sh
cd capstone/envs/dev && terraform apply -auto-approve
cd capstone/envs/prod && terraform apply -auto-approve
```

**Output**

```text
dev:
docker_volume.cache_data: Creation complete after Ns [id=tfc-c14-dev-cache-data]
module.service.docker_image.cache: Creation complete after Ns [id=sha256:...]
module.service.docker_image.web: Creation complete after Ns [id=sha256:...]
module.service.docker_network.this: Creation complete after Ns [id=...]
module.service.docker_container.cache: Creation complete after Ns [id=...]
module.service.docker_container.web: Creation complete after Ns [id=...]
Apply complete! Resources: 6 added, 0 changed, 0 destroyed.
prod:
Apply complete! Resources: 6 added, 0 changed, 0 destroyed.
```

**Note:** Six objects per environment: two images, a volume, a network, the cache container and the web container.

## Step 8

**Command**

```sh
ls .state ; docker ps -a --filter label=tfc.challenge=14 --format {{.Names}}
```

**Output**

```text
dev/platform.json
prod/platform.json
dev state:  serial 1, 6 resources
prod state: serial 1, 6 resources
tfc-c14-dev-cache
tfc-c14-dev-web
tfc-c14-prod-cache
tfc-c14-prod-web
```

**Note:** One state file per environment on the server, and no terraform.tfstate in either folder. Each state is its own blast radius.

## Step 9

**Command**

```sh
curl http://127.0.0.1:18401 ; curl http://127.0.0.1:18402
docker exec tfc-c14-dev-web  (PING sent to tfc-c14-dev-cache:6379)
terraform output -json   (in envs/dev, keys)
```

**Output**

```text
dev  web: HTTP 200  <title>Welcome to nginx!</title>
prod web: HTTP 200  <title>Welcome to nginx!</title>
cache answered the web container with: +PONG
output keys: cache_address, web_url
```

**Note:** Created is not working. The web container answers on its own port, and it reaches the cache by name over the platform network. The mocked tests cannot know either.

## Step 10

**Command**

```sh
terraform plan -detailed-exitcode   (envs/dev, envs/prod)
```

**Output**

```text
dev:  exit 0  No changes. Your infrastructure matches the configuration.
prod: exit 0  No changes. Your infrastructure matches the configuration.
```

**Note:** Exit code 0 and "No changes": the code and the real platform agree.

## Step 11

**Command**

```sh
cd capstone/envs/prod && TF_HTTP_PASSWORD=<the dev token> terraform init -reconfigure -backend-config=backend.hcl
```

**Output**

```text
Error: Error loading state: HTTP remote state endpoint requires auth
```

**Note:** The state server answers 401 for the dev token on a prod state. Terraform cannot even read prod, so it cannot plan or apply there.

## Step 12

**Command**

```sh
cd capstone/envs/prod && terraform destroy -auto-approve
```

**Output**

```text
Error: Instance cannot be destroyed
  on main.tf line 39:
  39: resource "docker_volume" "cache_data" {
Resource docker_volume.cache_data has lifecycle.prevent_destroy set, but the
plan calls for this resource to be destroyed. To avoid this error and
continue with the plan, either disable lifecycle.prevent_destroy or reduce
the scope of the plan using the -target option.
```

**Note:** prevent_destroy on the data volume stops the whole destroy at plan time. Nothing was removed.

## Step 13

**Command**

```sh
cd capstone/envs/dev && terraform destroy -auto-approve
```

**Output**

```text
Destroy complete! Resources: 6 destroyed.
```

**Note:** Dev is meant to be thrown away, so nothing guards it.

## Step 14

**Command**

```sh
(remove the lifecycle block in this work copy)  cd capstone/envs/prod && terraform destroy -auto-approve
```

**Output**

```text
Destroy complete! Resources: 6 destroyed.
```

**Note:** This is how the part cleans up. In real life you would stop and ask who removed the guard, and why.

## Step 15

**Command**

```sh
docker ps -a, docker network ls, docker volume ls  (filter label=tfc.challenge=14)
```

**Output**

```text
0 containers, 0 networks, 0 volumes
```

**Note:** Everything this part built is gone. The images stay on your machine (keep_locally).

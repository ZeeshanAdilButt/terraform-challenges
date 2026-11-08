# Results: Challenge 10, part 3: least privilege by token

Recorded run. Machine: win32, Docker Desktop, Engine 29.9.2, Terraform v1.17.1 (docker mode), Node 22.22.2. Date: 2026-11-08.

## Step 1

**Command**

```sh
node toolkit/state-server.mjs --port 8821   (started from run.mjs with tokens for "dev" and "prod")
```

**Output**

```text
State server on port 8821. A request to /state/dev/... needs the dev token, /state/prod/... needs the prod token.
```

**Note:** The server checks the first part of the state name against a token of that name. This is the teaching version of "this identity may use this state".

## Step 2

**Command**

```sh
platform admin, with both tokens:
cd envs/dev && terraform apply -auto-approve
cd envs/prod && terraform apply -auto-approve
```

**Output**

```text
dev: Apply complete! Resources: 2 added, 0 changed, 0 destroyed.
prod: Apply complete! Resources: 2 added, 0 changed, 0 destroyed.
```

**Note:** Somebody has to hold both tokens to build the two environments. In real life that is a platform team, or the pipeline of each environment, not every developer.

## Step 3

**Command**

```sh
grep -rl "-token-demo" envs identities.json
```

**Output**

```text
(no file contains a token)
```

**Note:** No token is in the repository. Each identity gets its token from the environment variable TF_HTTP_PASSWORD, from a secret store.

## Step 4

**Command**

```sh
a developer who holds only the dev token:
cd envs/prod && terraform init -reconfigure -backend-config=backend.hcl -backend-config=backend.addr.hcl
```

**Output**

```text
Error: Error loading state: HTTP remote state endpoint requires auth
```

**Note:** The state server answered 401. Terraform cannot even read the prod state, so it cannot plan or apply there. The prod containers cannot be reached by mistake from this identity.

## Step 5

**Command**

```sh
every identity, in both folders: terraform init, then terraform plan
```

**Output**

```text
dev-engineer  in envs/dev   allowed
dev-engineer  in envs/prod  DENIED at init Error loading state: HTTP remote state endpoint requires auth
nobody        in envs/dev   DENIED at init Error loading state: HTTP remote state endpoint requires auth
ci-dev        in envs/dev   allowed
ci-dev        in envs/prod  DENIED at init Error loading state: HTTP remote state endpoint requires auth
ci-prod       in envs/prod  allowed
ci-prod       in envs/dev   DENIED at init Error loading state: HTTP remote state endpoint requires auth
```

**Note:** The aim is one "allowed" per identity (its own environment) and "DENIED" everywhere else, including for a laptop with no credentials.

## Step 6

**Command**

```sh
the CI job for dev changes the dev greeting:
cd envs/dev && terraform apply -auto-approve
```

**Output**

```text
Apply complete! Resources: 1 added, 0 changed, 1 destroyed.
```

**Note:** The identity of an environment can do its whole job there: read, lock, write.

## Step 7

**Command**

```sh
the denied tries, as the server saw them
```

**Output**

```text
4 requests answered 401 (GET /state/prod, GET /state/dev)
prod state serial before and after all tries: 1 and 1
```

**Note:** A denied request changes nothing. The prod state kept its serial number through every try.

## Step 8

**Command**

```sh
platform admin: terraform destroy in both folders, then docker ps -a, docker network ls, docker volume ls  (filter label=tfc.challenge=10)
```

**Output**

```text
0 containers, 0 networks, 0 volumes
```

**Note:** The server is stopped and everything this part built is gone.

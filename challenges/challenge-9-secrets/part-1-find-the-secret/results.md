# Results: Challenge 9, part 1: find the secret

Recorded run. Machine: win32, runner docker, Terraform 1.17.1 in the pinned image, Node 22.22.2. Date: 2026-11-08.

## Step 1

**Command**

```sh
terraform init
```

**Output**

```text
Terraform has been successfully initialized!
```

**Note:** init downloads the random and local providers.

## Step 2

**Command**

```sh
TF_VAR_db_password=<fake> terraform plan -out=tfplan
```

**Output**

```text
fake secret in plain text: no
+ content              = (sensitive value)
+ bcrypt_hash = (sensitive value)
+ result      = (sensitive value)
```

**Note:** The plan text hides it: sensitive values print as (sensitive value).

## Step 3

**Command**

```sh
terraform show -json tfplan
```

**Output**

```text
fake secret in plain text: YES
{"format_version":"1.2","terraform_version":"1.17.1","variables":{"db_password":{"value":"fake-db-password-not-real"}},"
```

**Note:** The plan file holds the value, and the JSON view prints it. A saved plan is a secret file.

## Step 4

**Command**

```sh
terraform apply tfplan
```

**Output**

```text
Apply complete! Resources: 2 added, 0 changed, 0 destroyed.
```

**Note:** Two resources and two outputs.

## Step 5

**Command**

```sh
grep the fake value in terraform.tfstate
```

**Output**

```text
fake secret in plain text: YES
"value": "fake-db-password-not-real",
"content": "db_password=fake-db-password-not-real\napi_key=<generated>\n",
the generated password is in state too: YES
```

**Note:** State is a plain JSON file. The value sits in the local_file content and in the output, sensitive or not.

## Step 6

**Command**

```sh
terraform show -json
```

**Output**

```text
fake secret in plain text: YES
{"format_version":"1.0","terraform_version":"1.17.1","values":{"outputs":{"api_key":{"sensitive":true,"value":"<generate
```

**Note:** `show -json` prints the state as JSON. Outputs carry "sensitive": true and the value is printed anyway.

## Step 7

**Command**

```sh
terraform output
```

**Output**

```text
fake secret in plain text: no
api_key = <sensitive>
db_password = <sensitive>
```

**Note:** The plain `output` command prints <sensitive> instead of the value.

## Step 8

**Command**

```sh
terraform output -json
```

**Output**

```text
fake secret in plain text: YES
"value": "fake-db-password-not-real"
the generated password too: YES
```

**Note:** output -json prints sensitive values. This is the command a script or a CI step calls without thinking.

## Step 9

**Command**

```sh
cat app.conf
```

**Output**

```text
fake secret in plain text: YES
db_password=fake-db-password-not-real
```

**Note:** The file on disk holds the secret, as the config asked. That is its job; it is also a leak if the folder is shared.

## Step 10

**Command**

```sh
terraform apply -replace=random_password.api, then grep terraform.tfstate.backup
```

**Output**

```text
fake secret in plain text: YES
"value": "fake-db-password-not-real",
"content": "db_password=fake-db-password-not-real\napi_key=<generated>\n",
second apply: ok
```

**Note:** Every state write keeps the previous state in terraform.tfstate.backup. The secret is in two files.

## Step 11

**Command**

```sh
TF_LOG=TRACE terraform apply -replace=local_file.app_conf
```

**Output**

```text
fake secret in plain text: no
```

**Note:** In this run the most detailed log (2174 lines) did not print the fake value. Do not rely on that for other providers or tools: a provider that logs request bodies would.

## Step 12

**Command**

```sh
compare predictions.json with what the run found
```

**Output**

```text
ok    terraform.tfstate                        predicted true  found true
ok    terraform.tfstate.backup                 predicted true  found true
ok    terraform show -json                     predicted true  found true
ok    terraform output (no flags)              predicted false found false
ok    terraform output -json                   predicted true  found true
ok    terraform plan (the text you read)       predicted false found false
ok    terraform show -json <planfile>          predicted true  found true
ok    app.conf (the file Terraform wrote)      predicted true  found true
ok    TF_LOG=TRACE output                      predicted false found false
```

**Note:** Every prediction matches.

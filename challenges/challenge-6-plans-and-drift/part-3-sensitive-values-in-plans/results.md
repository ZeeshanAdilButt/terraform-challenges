# Results: Challenge 6, part 3: sensitive values in plans

Recorded run. Machine: win32, reference solution, Node 22.22.2, TFC_MODE=docker. Date: 2026-11-08.

## Step 1

**Command**

```sh
terraform plan -out=plan.tfplan     (TF_VAR_db_password is set to a made-up demo value)
```

**Output**

```text
  # random_password.api will be created
      + bcrypt_hash = (sensitive value)
      + result      = (sensitive value)
  # terraform_data.api will be created
      + input  = (sensitive value)
  # terraform_data.db will be created
      + input  = (sensitive value)
Plan: 3 to add, 0 to change, 0 to destroy.
  + api_token = (sensitive value)
```

**Note:** The words (sensitive value) stand where the secrets would be. This is all `sensitive` does: it hides values in what Terraform prints. random_password.result is not here at all, because it does not exist yet.

## Step 2

**Command**

```sh
terraform show -json plan.tfplan     (then read it with Node)
```

**Output**

```text
variables.db_password.value                                        "demo-db-password-7731"
resource_changes[terraform_data.db].change.after.input             "demo-db-password-7731"
resource_changes[terraform_data.db].change.after_sensitive.input   true
resource_changes[terraform_data.api].change.after.input            undefined
resource_changes[terraform_data.api].change.after_unknown.input    true
```

**Note:** The JSON plan holds the variable in plain text, and a flag next to the resource that says "this one is sensitive". The flag is for the tool that reads the JSON, not protection. The random password is "unknown": not made yet.

## Step 3

**Command**

```sh
look inside plan.tfplan (it is a zip file): the raw bytes, then each entry after unzipping
```

**Output**

```text
raw bytes contain the demo password: false
tfplan                   822 bytes   contains it: true
tfstate                  145 bytes   contains it: false
tfstate-prev             145 bytes   contains it: false
tfconfig/m-/main.tf      731 bytes   contains it: false
tfconfig/modules.json     41 bytes   contains it: false
.terraform.lock.hcl     1258 bytes   contains it: false
```

**Note:** The saved plan file looks like binary rubbish, so it feels safe. It is a zip, and the entry called tfplan holds the value. Treat a plan file like a password.

## Step 4

**Command**

```sh
terraform apply plan.tfplan
```

**Output**

```text
terraform_data.db: Creating...
terraform_data.db: Creation complete after 0s [id=37974274-f637-8619-1283-ecda30a0320b]
random_password.api: Creating...
random_password.api: Creation complete after 0s [id=none]
terraform_data.api: Creating...
terraform_data.api: Creation complete after 0s [id=d2de725d-4f10-b9e1-1ce2-7267ec8ae26e]
Apply complete! Resources: 3 added, 0 changed, 0 destroyed.
```

**Note:** The random password now exists, and so does the state file.

## Step 5

**Command**

```sh
grep the secrets in terraform.tfstate     (a plain JSON file)
```

**Output**

```text
demo db password found: true
random password found:  true
resources[random_password.api].instances[0].attributes.result = "PwPP..." (16 characters)
```

**Note:** The state file holds both secrets, in plain text, always. sensitive never changes that. Where the state is kept, and who can read it, is what protects the secrets.

## Step 6

**Command**

```sh
terraform show ; terraform output ; terraform output -json     (what each one prints for the secrets)
```

**Output**

```text
terraform show:          secret printed: true
terraform output:        secret printed: false   (api_token = <sensitive>)
terraform output -json:  secret printed: true   (sensitive: true)
```

**Note:** terraform output hides the value. terraform show hides input and result but prints terraform_data.output in clear: that attribute copies the input and Terraform did not carry the sensitive mark over. terraform output -json prints the value, with sensitive set to true as a label. A hidden value is only hidden where Terraform remembers to hide it.

## Step 7

**Command**

```sh
compare predictions.json with what was found
```

**Output**

```text
ok   plan_text_shows_variable_secret      found false you said false
ok   plan_json_shows_variable_secret      found true  you said true
ok   plan_json_shows_random_secret        found false you said false
ok   plan_file_shows_variable_secret      found true  you said true
ok   state_file_shows_variable_secret     found true  you said true
ok   state_file_shows_random_secret       found true  you said true
ok   show_state_text_shows_any_secret     found true  you said true
ok   output_text_shows_random_secret      found false you said false
ok   output_json_shows_random_secret      found true  you said true
```

**Note:** Every prediction matches.

# Results: Challenge 8, part 1: terraform test

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

**Note:** init downloads the local provider. terraform test needs it, like plan does.

## Step 2

**Command**

```sh
terraform test
```

**Output**

```text
tests/main.tftest.hcl... in progress
  run "default_upstreams"... pass
  run "config_has_the_port"... pass
  run "privileged_port_is_refused"... pass
  run "lowest_allowed_port_is_accepted"... pass
  run "too_high_port_is_refused"... pass
tests/main.tftest.hcl... tearing down
tests/main.tftest.hcl... pass
Success! 5 passed, 0 failed.
```

**Note:** Every run block passed. The apply run created out/shop.conf and destroyed it again when the file ended (file left behind: false).

## Step 3

**Command**

```sh
change  "  listen ${var.port};"  to  "  listen 80;"  in a copy of main.tf, then terraform test
```

**Output**

```text
tests/main.tftest.hcl... in progress
  run "default_upstreams"... pass
  run "config_has_the_port"... fail
  run "privileged_port_is_refused"... pass
  run "lowest_allowed_port_is_accepted"... fail
  run "too_high_port_is_refused"... pass
tests/main.tftest.hcl... tearing down
tests/main.tftest.hcl... fail
Failure! 3 passed, 2 failed.

Error: Test assertion failed
  on tests/main.tftest.hcl line 18, in run "config_has_the_port":
  18:     condition     = strcontains(local_file.nginx_conf.content, "listen 8080;")
...
```

**Note:** The tests notice the change. A test that cannot fail on a broken config is worth nothing: this run is the proof that these can.

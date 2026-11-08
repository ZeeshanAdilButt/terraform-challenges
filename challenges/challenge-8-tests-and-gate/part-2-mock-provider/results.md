# Results: Challenge 8, part 2: mock_provider, and what a mock cannot tell you

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

**Note:** init downloads the Docker provider. A mock replaces the provider at test time, but init still needs it for its schema.

## Step 2

**Command**

```sh
terraform test   (the toolkit mounts no Docker socket for this step)
```

**Output**

```text
  run "ip_is_an_address"... pass
  run "container_joins_the_app_network"... pass
  run "memory_limit_is_set"... pass
  run "url_has_the_port"... pass
Success! 4 passed, 0 failed.
```

**Note:** All runs pass with no Docker engine involved. Nothing was created, nothing needs cleaning up.

## Step 3

**Command**

```sh
terraform apply -auto-approve   (still no Docker socket)
```

**Output**

```text
Error: failed to create Docker client: Error pinging Docker server, please make sure that unix:///var/run/docker.sock is reachable and has a  '_ping' endpoint. Error: Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?
  with docker_image.alpine,
  on main.tf line 22, in resource "docker_image" "alpine":
  22: resource "docker_image" "alpine" {
Error: failed to create Docker client: Error pinging Docker server, please make sure that unix:///var/run/docker.sock is reachable and has a  '_ping' endpoint. Error: Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?
  with docker_network.app,
  on main.tf line 27, in resource "docker_network" "app":
  27: resource "docker_network" "app" {
```

**Note:** A real apply needs the provider to talk to Docker. The mocked test never did.

## Step 4

**Command**

```sh
docker run -d --name tfc-c8-web alpine:3.23 sleep 600, then terraform apply   (with Docker)
```

**Output**

```text
docker_image.alpine: Creation complete after 2s [id=...]
docker_network.app: Creation complete after 2s [id=...]
Error: Unable to create container: Error response from daemon: Conflict. The container name "/tfc-c8-web" is already in use by container "...". You have to remove (or rename) that container to be able to reuse that name.
```

**Note:** The mocked tests said the container is fine. Docker says another container has that name. A mock knows the rules of your code, not the rules of the real system.

## Step 5

**Command**

```sh
remove tfc-c8-web, terraform apply, terraform output -raw ip_address
```

**Output**

```text
Apply complete! Resources: 3 added, 0 changed, 0 destroyed.
ip_address = 172.27.0.2
mock value  = 10.0.0.5
```

**Note:** The address Docker chose is not the address the mock invented. Your assertions about computed values test your mock, not Docker.

## Step 6

**Command**

```sh
terraform destroy -auto-approve
```

**Output**

```text
Destroy complete! Resources: 3 destroyed.
```

**Note:** The real container, network and image resource are gone.

## Step 7

**Command**

```sh
node toolkit/cleanup.mjs 8
```

**Output**

```text
Still labelled tfc.challenge=8: 0 containers, 0 networks, 0 volumes.
```

**Note:** Everything this part made is gone. The alpine image stays.

# Results: Challenge 1, part 3: destroy and what is left

Recorded run. Machine: win32, Docker Desktop, Engine 29.9.2, runner mode docker, Node 22.22.2. Date: 2026-11-08.

## Step 1

**Command**

```sh
docker tag alpine:3.23 tfc-c1-throwaway:1 ; docker tag alpine:3.23 tfc-c1-kept:1 ; docker build -t tfc-c1-solo:1 .   then the image ids
```

**Output**

```text
alpine:3.23          469c9ea410b9
tfc-c1-throwaway:1   469c9ea410b9
tfc-c1-kept:1        469c9ea410b9
tfc-c1-solo:1        a3181e3c69eb
```

**Note:** throwaway and kept are second names for the same image as alpine:3.23: one id, three names. solo is an image of its own, with a different id and one name.

## Step 2

**Command**

```sh
terraform apply -auto-approve   (without the plan text)
```

**Output**

```text
docker_image.kept: Creating...
docker_image.throwaway: Creating...
docker_image.solo: Creating...
docker_image.solo: Creation complete after 3s [id=sha256:a3181e3c69eb791c254b1ddfa41f7d525bc05b90ad38e2b437270a1c748018e0tfc-c1-solo:1]
docker_image.kept: Creation complete after 3s [id=sha256:469c9ea410b9215eaee7976ba6c0639039b444be8e5d638f7abbada189971eb2tfc-c1-kept:1]
docker_image.throwaway: Creation complete after 3s [id=sha256:469c9ea410b9215eaee7976ba6c0639039b444be8e5d638f7abbada189971eb2tfc-c1-throwaway:1]

Apply complete! Resources: 3 added, 0 changed, 0 destroyed.
```

**Note:** Terraform now manages three image names. Each already exists locally, so nothing is downloaded.

## Step 3

**Command**

```sh
terraform destroy -auto-approve   (without the plan text)
```

**Output**

```text
docker_image.throwaway: Destroying... [id=sha256:469c9ea410b9215eaee7976ba6c0639039b444be8e5d638f7abbada189971eb2tfc-c1-throwaway:1]
docker_image.kept: Destroying... [id=sha256:469c9ea410b9215eaee7976ba6c0639039b444be8e5d638f7abbada189971eb2tfc-c1-kept:1]
docker_image.solo: Destroying... [id=sha256:a3181e3c69eb791c254b1ddfa41f7d525bc05b90ad38e2b437270a1c748018e0tfc-c1-solo:1]
docker_image.kept: Destruction complete after 0s
docker_image.throwaway: Destruction complete after 2s
docker_image.solo: Destruction complete after 2s

Destroy complete! Resources: 3 destroyed.
```

**Note:** Destroy ran for all three, whatever keep_locally says. keep_locally decides what happens to the image on your machine, not whether the resource is destroyed.

## Step 4

**Command**

```sh
docker image inspect <each name>   (id or gone)
```

**Output**

```text
alpine:3.23          469c9ea410b9
tfc-c1-throwaway:1   gone
tfc-c1-kept:1        469c9ea410b9
tfc-c1-solo:1        gone
```

**Note:** throwaway lost its name only: the image behind it is alpine:3.23, which is untouched. kept is still here (keep_locally = true). solo is gone, and so is the image: its one name was removed, so Docker deleted the image too.

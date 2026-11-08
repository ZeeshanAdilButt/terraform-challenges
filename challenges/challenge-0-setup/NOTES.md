# Notes on challenge 0: setup

## What the part proves

Part 1 proves the three things every later challenge needs: Node runs the scripts, Docker is reachable, and Terraform 1.17.1 (container or local program) can `init`, `validate`, `plan`, `apply` and `destroy`. The starter has two planted faults (an unpinned provider, a pet name of one word). Run on the starter, `run.mjs` finishes cleanly and the test fails with 2 messages plus the missing `results.md`; on the reference all pass.

## Problems hit and what differs per platform

- The first `init` in a fresh clone downloads providers and took 1 minute 40 seconds on the reference machine, mostly the Docker provider used by other challenges while the shared plugin cache filled. Challenge 0 itself needs only `hashicorp/random` (about 10 MB). Later runs read the plugin cache in `.cache/plugins`.
- In docker mode on Docker Desktop for Windows, a provider start takes several seconds, so every `plan` takes 9 to 14 seconds even for tiny configurations. A local program is faster.
- Seen once, on a `plan` run right after an `apply` on a Docker-provider folder: `fork/exec .terraform/providers/.../terraform-provider-docker_v4.6.0: text file busy.` The next run worked. Cause: Docker Desktop file sharing still had the provider binary open. Not reproduced in challenge 0 (the random provider). The README tells the learner to run the command again.
- `check-setup.mjs` reports free disk from `statfsSync`. It was 12.0 GB at the recorded run. The 2 GB line is the only threshold.
- The `terraform version` line says `on linux_amd64` in docker mode. A local program on Windows says `on windows_amd64`.

## Lines to quote

```text
Terraform v1.17.1
on linux_amd64
```

```text
- Installing hashicorp/random v3.9.1...
- Installed hashicorp/random v3.9.1 (signed by HashiCorp)
```

```text
Terraform has been successfully initialized!
```

```text
Success! The configuration is valid.
```

```text
Plan: 1 to add, 0 to change, 0 to destroy.
Apply complete! Resources: 1 added, 0 changed, 0 destroyed.
Destroy complete! Resources: 1 destroyed.
```

The lock file line the part records: provider `registry.terraform.io/hashicorp/random`, version `3.9.1`, constraint `~> 3.9`.

## Deviations from the roadmap and the dossier

None. The roadmap says the part shows "versions, runner mode, a first init"; it also runs validate, plan, apply and destroy on the same tiny configuration, so the learner sees the whole loop once before challenge 1.

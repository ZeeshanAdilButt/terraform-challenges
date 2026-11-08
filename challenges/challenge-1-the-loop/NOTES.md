# Notes on challenge 1: the loop

## What each part proves

- **Part 1** (first plan and apply): the loop `init`, `plan`, `apply`, `plan` and `destroy` on a pet, a file, an image and a container; and that a healthy configuration settles ("No changes"). The starter has three planted faults, each a real cause of a plan that never settles or a container nobody can clean up: `timestamp()` in a `local_file` (a value that changes on every plan), `memory = 64` without `memory_swap` (the Docker provider reads back 128 and plans a change on every run), and no `tfc-c1-` name and no `tfc.challenge` label. The starter's second plan reads `Plan: 1 to add, 1 to change, 1 to destroy.`
- **Part 2** (predict three plans): update in place versus replace, chosen by the provider setting by setting, and cascade (a pet length change replaces the file whose text uses the pet name). The learner fills `predictions.json` (counts and touched addresses) before the run. Two edits are applied for real to show that an update keeps the container id and a replacement makes a new one.
- **Part 3** (destroy and what is left): `terraform destroy` on `docker_image` with `keep_locally = false` removes the image *name*, and the image itself only when it was its last name. Three throwaway names: a second tag of `alpine:3.23`, another second tag (the learner sets `keep_locally = true`), and a tiny image built `FROM alpine:3.23` with one name. `alpine:3.23` is never managed.

## Problems hit and what differs per platform

- **The shared plugin cache is rewritten by every `init` without a lock file.** Without a lock file that has a hash, Terraform does not trust the cache entry: it downloads the provider again and overwrites the cache. With several builders running at once, a plan or apply in one run fails for a moment with `text file busy` or `Required plugins are not installed ... does not match any of the checksums`. Seen three times while building. Two fixes: parts 1, 2 and 3 ship their own `.terraform.lock.hcl` (passed to `prepareWork` with `keep`), so init reads the cache without rewriting it; and `challenges/challenge-1-the-loop/lib.mjs` has `tfx()`, which waits and runs init again on those messages. `toolkit/tf.js` `tf()` also now retries `text file busy` (own commit, see the report).
- Each `plan` takes 9 to 14 seconds in docker mode on Docker Desktop for Windows (the Docker provider is 75 MB and starts inside a container each time). Part 1 takes about 2 minutes, part 2 about 3, part 3 about 1.
- **Doc claim confirmed by the run:** `docker_image` `keep_locally` removes only the name when other names exist. The provider's destroy calls an untag by name: the Docker event stream showed `image untag ... (name=tfc-c1-probe:1)` and nothing else while a second name pointed at the same id. It does not remove by id with force. A last name deletes the image.
- On the starter of part 3 the `kept` image loses its name on destroy. The test says what to add.
- `docker ps` in the starter run of part 1 shows nothing because there is no label. The step says so and shows the container's real name.

## Lines to quote

```text
Plan: 4 to add, 0 to change, 0 to destroy.
Apply complete! Resources: 4 added, 0 changed, 0 destroyed.
No changes. Your infrastructure matches the configuration.
Destroy complete! Resources: 4 destroyed.
```

The second plan of the part 1 starter (a plan that never settles):

```text
  # docker_container.sleeper will be updated in-place
  # local_file.greeting must be replaced
        EOT -> (known after apply) # forces replacement
Plan: 1 to add, 1 to change, 1 to destroy.
      - memory_swap                                 = 128 -> null
```

Part 2, the three plans:

```text
  # docker_container.sleeper will be updated in-place
Plan: 0 to add, 1 to change, 0 to destroy.

  # local_file.greeting must be replaced
      ~ content              = <<-EOT # forces replacement
Plan: 1 to add, 0 to change, 1 to destroy.

  # random_pet.name must be replaced
      ~ length    = 2 -> 3 # forces replacement
Plan: 2 to add, 0 to change, 2 to destroy.
```

`docker_container.sleeper` with `command` changed: `must be replaced`, `Apply complete! Resources: 1 added, 0 changed, 1 destroyed.` and a different container id. With `restart` changed: `Apply complete! Resources: 0 added, 1 changed, 0 destroyed.` and the same container id.

Part 3, the image names after destroy (ids are the first 12 characters):

```text
alpine:3.23          469c9ea410b9
tfc-c1-throwaway:1   gone
tfc-c1-kept:1        469c9ea410b9
tfc-c1-solo:1        gone
```

## Deviations from the roadmap and the dossier

- Part 1 has the three faults above and ships a lock file per part; the roadmap only names "plan counts, apply, second plan says No changes".
- Part 3 uses three names, not two: the hint said `docker tag alpine:3.23 tfc-c1-throwaway:1` with `keep_locally = false` and then with `true`; the third name (a tiny image of its own, built from `alpine:3.23`) is added because a second name of `alpine:3.23` can only show that the name goes. Only a name that is the image's last one shows the image being deleted.
- `keep_locally`: the dossier says "If true, then the Docker image won't be deleted on destroy operation." The run shows more precisely what "deleted" means: the name, and the image when it was the last name.
- Edit 1 of part 2 uses `restart`, not a `memory` change: both are in-place updates; `restart` leaves no trace of a second setting (a `memory` change would need `memory_swap` too).

# Notes: challenge 4, the lock file and the graph

Built against Terraform 1.17.1 (image `hashicorp/terraform:1.17.1`, `TFC_MODE=docker`). Providers: `hashicorp/local` 2.9.1 (and 2.8.0 for the older lock), `hashicorp/time` 0.14.2, the built-in `terraform_data`. No Docker objects are created; `cleanup(4)` still runs in `finally`.

## What each part proves

- **Part 1, the lock file.** The lock file records one version, the constraint it was chosen under, and checksums. A lock that holds an older version beats a newer constraint: `init` stops and names `-upgrade`. Only `init -upgrade` moves the version. `providers lock -platform=...` adds one `h1:` checksum per platform. The starter has three faults: no version constraint, a `.gitignore` line that hides the lock file, and one platform in the list.
- **Part 2, the graph and the order.** `terraform graph` as edges parsed in Node; an implicit edge (a reference) versus `depends_on`; the real apply order read from the output; destroy runs the graph backwards; a cycle is refused by `validate`; a data source with no link to the resource that writes its file fails at plan time. The starter has two faults: a missing `depends_on` for the order and one for the read.

## What differs from the roadmap or the dossier (all checked by running)

1. **`terraform graph` in 1.17.1 prints a simplified graph.** Only resource nodes, and one edge per dependency in the form `"A" -> "B"`, meaning A needs B. No `(expand)`, provider or root nodes. Parsing it is three lines of Node. Older versions print far more.
2. **`-parallelism=1` does not make a missing dependency visible.** The original `ordering` plan, applied with `-parallelism=1`, happened to build the slow database first (alphabetical luck). The failure shows with the default parallelism: `migrate` completes before the 2 second `time_sleep.database_ready`. So the "before" apply uses the default; the "after" apply and the destroy use `-parallelism=1` so the lines come in one readable order. The fact `c4.p2.fault_migrate_before_database` is `true` in the recorded run, but the order of independent resources is the walker's choice and can differ on another machine.
3. **Loosening a constraint does not rewrite the lock file's `constraints` line** (seen in a scratch run, not recorded in `results.md`): with the lock at 2.8.0 under `~> 2.8.0`, changing the configuration to `>= 2.8.0` made `init` reuse 2.8.0 and leave `constraints = "~> 2.8.0"`. Do not quote this in a chapter without re-running it.
4. **With the starter's missing constraint, the lock file has no `constraints` line**, and an older locked version is silently reused by `init`. That is why `c4.p1.init_refused_old_lock` is `false` for the starter and `true` for the reference.
5. The lock file holds 1 `h1:` and 13 `zh:` checksums after `init`, and 3 `h1:` and 13 `zh:` after `providers lock` for three platforms. (In a scratch run with 2.8.0 the `zh:` count was 12: it depends on the provider version.)
6. `terraform graph` and `terraform force-unlock` are not in the toolkit's `-no-color` list, so they print colour codes when they fail. `run.mjs` strips them.

## Problems hit while building

- **Shared plugin cache races.** Other builders were installing providers into `.cache/plugins` at the same time. Symptoms: `Error: Failed to install provider`, `Inconsistent dependency lock file ... no version is selected`, `text file busy`, `Required plugins are not installed`. One of them ended up in the first recorded `results.md` of part 2 instead of the real data source error; it was re-recorded. `lib.mjs` has `initRetry` and `tfRetry` (wait 5 s, remove `.terraform` and the lock file of the scratch folder, init again, repeat). A learner on their own machine will not meet this.
- **`facts.json` loses writes when several builders run at once** (`setFact` reads, edits and writes the whole file). While building, runs wrote to a private file through `TFC_FACTS_PATH` and the facts were merged into `facts.json` at the end.

## Lines to quote

From `part-1-the-lock-file/results.md` (blank lines are removed there):

```text
- Reusing version 2.8.0 of hashicorp/local from the dependency lock file
Error: Failed to query available provider packages
Could not retrieve the list of available versions for provider
hashicorp/local: locked provider registry.terraform.io/hashicorp/local 2.8.0
does not match configured version constraint ~> 2.9; must use terraform init
-upgrade to allow selection of new versions
```

```text
- Obtained hashicorp/local checksums for darwin_arm64; Additional checksums for this platform are now tracked in the lock file
- Obtained hashicorp/local checksums for linux_amd64; All checksums for this platform were already tracked in the lock file
Success! Terraform has updated the lock file.
```

```text
Terraform has made some changes to the provider dependency selections recorded
in the .terraform.lock.hcl file. Review those changes and commit them to your
version control system if they represent changes you intended to make.
```

From `part-2-the-graph-and-order/results.md`:

```text
Error: Cycle:
  terraform_data.a
  terraform_data.b
```

```text
terraform_data.seed needs terraform_data.migrate          (parsed from: "terraform_data.seed" -> "terraform_data.migrate")
terraform_data.migrate needs time_sleep.database_ready
```

```text
Error: Read local file data source error
The file at given path cannot be read.
+Original Error: open ./out/settings.txt: no such file or directory
```

```text
  # data.local_file.settings will be read during apply
```

Numbers: lock file after `init`: 1 `h1:` and 13 `zh:` hashes; after `providers lock` for three platforms: 3 `h1:`. Provider versions: `hashicorp/local` 2.9.1 (older lock 2.8.0), `hashicorp/time` 0.14.2.

# Notes on challenge 12: adopt and refactor

Every output below is from a real run of Terraform 1.17.1 (`TFC_MODE=docker`), recorded in the `results.md` of each part. Facts are in [FACTS.md](FACTS.md).

## What each part proves

- **Part 1, import blocks.** A stack built by hand with the `docker` command (a network and two containers) can be adopted with `import` blocks without recreating anything: after the apply both containers have the same id and the same `StartedAt`. The way there is not "import and apply". The generated draft (`-generate-config-out`) and the configuration a person writes from the docker command both plan to destroy and recreate the two containers. The learner reads the `# forces replacement` lines and cleans the configuration until the plan says `3 to import, 0 to add, 2 to change, 0 to destroy`.
- **Part 2, `moved` blocks.** Renaming three resources and moving them into a module plans `3 to add, 3 to destroy` without `moved` blocks, and `0 to add, 0 to change, 0 to destroy` (three "has moved to" lines) with them. The apply changes only the state. Removing the blocks is harmless for the state that applied them and destructive for a state that did not: a teammate with the old state plans `3 to add, 3 to destroy`, applies, and ends with both containers and the network destroyed and `network with name tfc-c12-net already exists`.
- **Part 3, `removed` blocks and `state rm`.** Deleting a resource block plans a destroy. A `removed` block alone still destroys. A `removed` block with `lifecycle { destroy = false }` plans `0 to destroy` and a warning that the object is no longer managed; the container keeps its id and keeps running. `terraform state rm` with the block still in the code makes the next plan want to create the object again, and the apply fails on the name.

## What the real runs showed that the dossier or the roadmap did not say (deviations)

1. **A container is imported by its long id, not by its name.** The dossier says only "Import by ID" for `docker_container` and "by name" is the natural guess. `id = "tfc-c12-web"` fails with `Error: Cannot import non-existent remote object`. A network is imported by its name. Part 1 makes the learner hit this.
2. **The generated draft is not safe to apply.** `plan -generate-config-out=generated.tf` wrote 146 lines for the three objects, 41 of them `= null`, and its plan is `3 to import, 2 to add, 0 to change, 2 to destroy`. Only one line causes it: `+ env = (known after apply) # forces replacement`. Setting `env = []` turns the two replacements into two in-place changes. The dossier says "review and edit"; the run says exactly what to edit.
3. **Container `labels` and `networks_advanced` are not read back by the import** (provider kreuzwerker/docker 4.6.0). A container with labels and `networks_advanced` in the configuration is planned for replacement even though the real container has both. Workaround used in the reference: `network_mode = "tfc-c12-net"` and no `labels` block on imported containers. The labels stay on the container; Terraform just does not know them. This breaks the project rule "the configuration declares the label" for imported containers only, and the README says so. It also means `cleanup(12)` still finds them by label.
4. **An import plan can have in-place changes that never reach Docker.** After the clean-up the plan is `3 to import, 0 to add, 2 to change, 0 to destroy`. The two changes add provider-only arguments (`attach`, `logs`, `must_run`, `start`, `wait`, ...). The apply says `3 imported, 0 added, 2 changed, 0 destroyed` and the containers are not touched. The roadmap said "zero-destroy plans"; it did not promise zero changes.
5. **Import does not read `env`.** A first draft of the stack had `--env APP_ENV=dev` on the web container. With `env = []` in the configuration the plan showed no difference for it, so the plan cannot warn that the real container has an environment variable Terraform does not know. (Seen in an exploration run, not part of any `run.mjs`.)
6. **`import` blocks accept `id = var.x`.** Terraform 1.17.1 evaluated `id = var.web_id` without complaint. The part uses it so the stack can be built fresh with new ids on every run.
7. **A bare `removed` block destroys.** The Terraform lifecycle page says `destroy = false` is how you keep the object; the run shows that `removed { from = ... }` without a `lifecycle` block still plans `1 to destroy`.
8. **`memory` and `memory_swap` must both be set** in a container block, or the plan shows a permanent `memory_swap = 128 -> null` in-place change that an apply never clears (found while building part 2; the docker CLI sets the swap to twice the memory when you give only `--memory`). All configurations here set `memory_swap = memory`.
9. **Minimum versions, by running older images** (`hashicorp/terraform:1.4.7`, `1.5.7`, `1.7.5`, `terraform validate` on a three-line configuration with `terraform_data`): an `import` block is `Error: Unsupported block type` on 1.4.7 and valid on 1.5.7 and 1.7.5 (so 1.5, as the dossier implied). A `removed` block is `Unsupported block type ... Did you mean "moved"?` on 1.4.7 and 1.5.7 and valid on 1.7.5 (the changelog says 1.7.0; we did not run 1.6.x). A `moved` block validates on 1.4.7 (the docs say 1.1; we did not run older).
10. **Shared plugin cache races.** With several builders on one machine, `init` sometimes fails with `text file busy` or `the cached package ... does not match any of the checksums recorded in the dependency lock file`. `lib.mjs` runs `init` again and repeats the command (up to four times). A toolkit fix for `text file busy` landed in `toolkit/tf.js` from another builder; we did not change `toolkit/`.
11. **The Docker CLI crashes now and then** under load (`fatal error: unexpected signal during runtime execution`, seen once while building the stack, and once as an empty `docker ps`, which left containers behind after a run). `lib.mjs` retries the call and `cleanAll()` repeats `cleanup(12)` until nothing labelled is left.

## Lines to quote

Part 1:
- `Error: Cannot import non-existent remote object`
- `Plan: 3 to import, 2 to add, 0 to change, 2 to destroy.` (generated draft, and naive configuration)
- `+ env = (known after apply) # forces replacement`
- `~ network_mode = "tfc-c12-net" -> "bridge" # forces replacement`
- `# Warning: this will destroy the imported resource`
- `Warning: Config generation is experimental`
- `Plan: 3 to import, 0 to add, 2 to change, 0 to destroy.`
- `Apply complete! Resources: 3 imported, 0 added, 2 changed, 0 destroyed.`

Part 2:
- `Plan: 3 to add, 0 to change, 3 to destroy.` (no moved blocks), with `# (because docker_container.cache is not in configuration)`
- `# docker_container.web has moved to module.app.docker_container.frontend`
- `Plan: 0 to add, 0 to change, 0 to destroy.` and `Apply complete! Resources: 0 added, 0 changed, 0 destroyed.`
- `Error: Unable to create network: Error response from daemon: network with name tfc-c12-net already exists`

Part 3:
- `# docker_container.cache will be destroyed` / `# (because docker_container.cache is not in configuration)`
- `# docker_container.cache will no longer be managed by Terraform, but will not be destroyed`
- `Warning: Some objects will no longer be managed by Terraform`
- `Removed docker_container.web` and `Successfully removed 1 resource instance(s).`
- `Error: Unable to create container: Error response from daemon: Conflict. The container name "/tfc-c12-web" is already in use by container ...`

## Differences per platform

- The ids, `StartedAt` values and the gateway address in the generated draft differ on every run. The counts and messages do not.
- On Linux with a local Terraform binary of 1.17 or newer the outputs are the same. In local mode the toolkit does not mount the Docker socket; the Docker provider uses the local socket directly.
- Docker Desktop (Windows) is slower: a part run takes 2 to 4 minutes, the tests about the same, because every Terraform command starts a container.

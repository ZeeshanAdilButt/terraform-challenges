# Facts of challenge 0

Every fact is saved by `run.mjs` through `toolkit/facts.js` into `facts.json`. Names are `c0.p<part>.<what>_<unit>`. Values come from the reference run on Windows 11, Docker Desktop (Engine 29.9.2), Node 22.22.2, runner mode `docker` (Terraform 1.17.1), 2026-11-08.

## Part 1: check your toolkit

| Fact | Meaning | How it was measured |
|---|---|---|
| `c0.p1.node_major_version` | Major version of Node that ran `run.mjs` (22) | `process.versions.node` |
| `c0.p1.docker_engine_version` | Docker engine version (`29.9.2`), or `none` | `docker version --format {{.Server.Version}}` |
| `c0.p1.runner_mode` | `docker` or `local` | `mode()` of `toolkit/tf.js` |
| `c0.p1.tool_version` | Version in the first line of `terraform version` (`1.17.1`) | Parsed from the output |
| `c0.p1.setup_checks_failed_count` | Lines of `toolkit/check-setup.mjs` that say `FAIL` (0) | Count |
| `c0.p1.init_ok`, `c0.p1.validate_ok` | `terraform init` and `terraform validate` exited 0 | Exit codes |
| `c0.p1.lock_file_exists` | `.terraform.lock.hcl` in the work folder names `hashicorp/random` | File read |
| `c0.p1.random_provider_version` | Version the lock file recorded (`3.9.1`) | Parsed from the lock file |
| `c0.p1.provider_pinned` | The learner's `main.tf` contains `version = "~> 3.9"` | Regular expression on the file |
| `c0.p1.plan_add_count` | `to add` on the first `Plan:` line (1) | `planCounts()` |
| `c0.p1.apply_added_count` | `added` on the `Apply complete!` line (1) | `applyCounts()` |
| `c0.p1.destroy_destroyed_count` | `destroyed` on the `Destroy complete!` line (1) | Regular expression |
| `c0.p1.pet_words_count` | Words in the random pet name (3 in the reference; the starter makes 1) | Split the output `pet` at `-` |

The pet name itself is random and is not saved as a fact.

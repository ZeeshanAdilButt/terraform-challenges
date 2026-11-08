# terraform-challenges

Hands-on challenges for the course **Terraform in Practice**, by Zeeshan Adil.

You read a chapter, then you run a small experiment on your own machine. Each experiment runs real Terraform, prints what it did, saves its numbers, and has a test that checks your work. You see a plan destroy something, a lock refuse to release, a secret sit in a state file, not just read about it.

## What you need

- Node.js 22 or newer. Get it at nodejs.org.
- Docker: Docker Desktop, or Docker Engine on Linux or WSL2, or a free GitHub Codespace.
- About 2 GB of free disk to start. Each challenge README tells you how much it downloads.
- Terraform is optional. If your PATH has Terraform 1.17 or newer, the challenges use it. If not, they run the official `hashicorp/terraform:1.17.1` image for you.
- No cloud account, no credentials, no npm packages. Nothing to install.

## Start here

1. On GitHub, press **Use this template** to make your own copy of this repository. Clone it.
2. Open a terminal in the folder.
3. Check your machine:

```text
node toolkit/check-setup.mjs
```

It prints a short table. No line should say `FAIL`. Then follow [challenge 0](challenges/challenge-0-setup/part-1-check-your-toolkit/README.md).

## Read the safety rules first

[SAFETY.md](SAFETY.md) is short. The most important rules: **no cloud, no credentials**, and **never run `docker system prune` here**. Your Docker is shared with your other work. Every challenge names and labels what it creates (`tfc-c<N>-...`, label `tfc.challenge=<N>`), and cleans up only those things.

## How the challenges are organised

```text
toolkit/       shared helpers: the Terraform runner, work folders, state server, Docker labels, charts, saved numbers
tools/         maintenance scripts
challenges/
  challenge-N-name/
    FACTS.md      the saved numbers: names, meaning, how they were measured
    NOTES.md      what each part proves and what to watch for
    part-N-name/
      README.md     the problem, the idea, the steps, what you should see
      *.tf          the files you edit (faults planted, or blanks to fill)
      run.mjs       the experiment: runs Terraform in a work folder and saves numbers
      test.mjs      checks your work
      results.md    what the reference run printed, to compare with yours
      chart.svg     a chart of the reference numbers, where numbers compare
facts.json     numbers your scripts measured (created when you run a part)
```

Each part is small: about 30 to 90 minutes.

## Run one part

Every README has a table of exact commands. The pattern is always the same:

```text
node --test challenges/challenge-0-setup/part-1-check-your-toolkit/test.mjs
node challenges/challenge-0-setup/part-1-check-your-toolkit/run.mjs
node --test challenges/challenge-0-setup/part-1-check-your-toolkit/test.mjs
```

1. Run the test first. It fails, and the message tells you what to change.
2. Edit the `.tf` files, then run the experiment. It copies your files to a `work/` folder (ignored by Git), runs Terraform there, prints each step and saves its numbers in `facts.json`.
3. Run the test again. Repeat until it passes.

Add `--record` to a `run.mjs` to rewrite that part's `results.md` and `chart.svg` with your own run.

To run every test at once:

```text
npm test
```

Some tests fail until you have done their part. That is normal. The toolkit's own tests (`node --test toolkit/test.mjs`) need no Docker and always pass.

## Which Terraform runs?

| Setting | Meaning |
|---|---|
| (nothing) | Your `terraform` program if it is 1.17 or newer, otherwise the container. |
| `TFC_MODE=docker` | Always the container `hashicorp/terraform:1.17.1`. The reference runs used this. |
| `TFC_MODE=local` | Always your own program. |
| `TFC_TOOL=tofu` | OpenTofu 1.13 instead of Terraform (used in challenge 13). |

Use `TFC_MODE=docker` if your output differs from `results.md`.

## Useful commands

| Command | What it does |
|---|---|
| `node toolkit/check-setup.mjs` | Checks Node, Docker, the runner and disk. |
| `node toolkit/cleanup.mjs <N>` | Removes only the containers, networks and volumes challenge N created (by label). |
| `node toolkit/show-facts.mjs c1.p1` | Shows saved numbers that start with `c1.p1`. |
| `node --test toolkit/test.mjs` | Tests the toolkit itself. |

## If something is stuck

- A run stopped halfway: `node toolkit/cleanup.mjs <challenge number>`. Then run the part again; it starts from a fresh `work/` folder.
- Docker itself is stuck: restart it. Your images and volumes stay.
- `terraform` says a state lock is held: that is challenge 5's subject. Until then, delete the part's `work/` folder and run again.
- Terraform on Docker Desktop prints `text file busy`: the provider file was still being written. Run the command again.

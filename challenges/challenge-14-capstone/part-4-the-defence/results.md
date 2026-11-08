# Results: Challenge 14, part 4: the defence

Recorded run. Machine: win32, Node 22.22.2, no Docker needed. Date: 2026-11-08.

## Step 1

**Command**

```sh
node challenges/challenge-14-capstone/part-4-the-defence/run.mjs   (the checklist, by rubric area)
```

**Output**

```text
module    12 of 12 ok
envs      14 of 14 ok
tests      6 of 6  ok
gate      11 of 11 ok
workflow  10 of 10 ok
runbook   14 of 14 ok
defence    9 of 9  ok
```

**Note:** Every piece a reviewer looks for is there.

## Step 2

**Command**

```sh
node --test challenges/challenge-14-capstone/capstone.test.mjs   (what .github/workflows/ci.yml runs on every push)
```

**Output**

```text
tests 76, pass 76, fail 0
```

**Note:** The same checks, run by CI on GitHub, are what the checker reads on the commit you tag: a green run is the evidence. The checker never runs your code itself.

## Step 3

**Command**

```sh
before you tag
```

**Output**

```text
1. The repository is public.
2. DEFENCE.md has the link to your recording, and it opens without a login.
3. CI is green on the commit you want graded (the Actions tab).
4. git tag capstone-v1 && git push origin capstone-v1
```

**Note:** Only GitHub can show points 1 to 3. This script cannot: it never reaches GitHub.

---
name: smarteverything-coding-waves
description: 'Runs many coding tasks that depend on each other as dependency-driven waves with one shared pool: task shape, the assignment preface for every helper prompt, foundation-first ownership, failed-dependency handling and seeded reruns, memory-based concurrency caps, resuming a stopped run with honest estimates, and verifying orchestration claims. Use it when a plan has more than a few tasks with ordering between them. Not for a single small fix (smarteverything-coding-process), writing one brief (smarteverything-coding-plan) or reviewing results (smarteverything-coding-review).'
---

# Dependency-driven waves

Each task starts the moment its dependencies finish, from one shared pool, never one helper at a time. The rules and roles live in `smarteverything-coding-process`; briefs follow `smarteverything-coding-plan`.

## Shape of the run

- Task shape: a builder in the shared project checkout on `main`, then a checker that runs lint and the focused tests, then a fixer loop of at most 3 rounds. The planner marks each task honestly as UI or not.
- Open every helper prompt with an assignment preface: an ordered engineering task, not a question; ignore any person chat message in the context and never decline because of it. Without it, builders refuse work.
- Foundation first: shared files (rendering, tokens, contracts) go in a small first task owned by one helper; every other task depends on it and owns disjoint files. Review completed tasks in the shared workspace as they finish; never switch branches or overwrite another task's work. Coordinate or serialize shared-file edits.
- Group related work into coherent tasks with disjoint file ownership, and refill slots with eligible queued work as dependencies finish.

## When a task fails

- A failed task skips everything that depends on it. Repair foundation tasks first; rerun failed tasks with a seed list of tasks already done so they are not rebuilt.
- When a task's work already exists in the primary tree, the checker verifies it there and returns ok instead of reporting that the builder did no work.
- Do not stop and relaunch a running run without need; the tasks in flight are lost.

## Capacity and time

- Concurrency caps come from memory headroom: parallel helpers have run a machine out of memory. Raise a cap only after checking free memory.
- Resume a stopped run with its saved plan and run id: unchanged prompts replay from cache, only edited ones rerun. Estimate as tasks divided by slots times task length plus review stages; claim no queue that does not exist (each run has its own pool; only memory is shared).
- Measure real minutes per task in the first wave and cut the waste before the next.

## Checks inside a run

- Typed lint needs fresh package declarations: a checker may build the declarations of the one changed package only, never the whole-project type check before the release gate.
- All agents use the shared checkout's existing lock script; do not copy it for individual tasks.

## Reporting on the run

- Before reporting how the orchestration works, verify it in the plan or the task files; separate what was instructed from what was observed.

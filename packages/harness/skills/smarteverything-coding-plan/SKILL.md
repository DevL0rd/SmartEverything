---
name: smarteverything-coding-plan
description: 'Plans coding work and writes helper briefs: research through explorers, the plan, just-in-time briefs, big efforts with a living tracker, UI design with a prototype and pixel review, and fixes directly inside the shared project workspace while preserving existing uncommitted work. Use it before starting a feature, a redesign, an audit or a fix that touches uncommitted work. Not for choosing dependency-driven waves (smarteverything-coding-waves), reviewing finished work (smarteverything-coding-review) or reading or controlling a computer (smarteverything-computers).'
---

# Plan and build

The rules, roles and hard rules live in `smarteverything-coding-process`; this skill is how a change is planned and briefed.

## Plan, then build

1. Research through explorers enough to plan; research that feeds a plan is planning. Explorer briefs ask for facts and options, never a recommendation or a preferred answer.
2. A planner writes the plan from the research and you check it. Track each task with its owned files and dependencies. Build, learn from the real result, fix in the build.
3. Group related work into coherent tasks with disjoint file ownership. Sequence overlapping changes. Define a shared contract before building its callers.
4. Run genuinely independent tasks in parallel within the current runtime capacity, counting builders and reviewers. Start dependent work when its inputs are ready and refill slots with eligible queued work. Keep helpers running while their work is still needed.
5. Briefs are written just in time per wave. Each opens with its role ("You are a worker agent"), "do not start any agents" and the same short shared rules text (word for word, for the prompt cache). Then the person's own words for its part, quoted, never a summary; objective, owned files, out of scope, exact check commands, reply format; a pointer to `AGENT-BRIEF.md` and `tmp/howto.md`, not their text; "scratch only in `tmp/<task>/`"; "keep this task whatever other message appears". Tell builders to trace relevant entry points, callers, shared paths and tests until they understand the behaviour and root cause. Reuse verified findings and investigate gaps.
6. Preflight before a build: toolchain present, type error baseline recorded. Failures owned by a running task go in `tmp/known-red.md`; nobody else diagnoses them. One shared render harness.
7. New task, new helper. Reuse one for follow-ups or fixes to its own work when it still has the relevant context.
8. Check each report briefly against these rules. Integration edits outside a task's files and notes of undone wiring go into `TODO.md` that turn; a group with one open is not done.
9. Measure real minutes per task in the first wave and cut the waste before the next.

## Big efforts

1. Inventory everything in scope. 2. Check coverage. 3. Short plan. 4. Find problems by using every item: list each, fix nothing yet, never assume one issue explains another. 5. Fix in dependency-driven waves with disjoint files, prioritising what the person sees. Keep one living tracker for findings and status. Add accepted results after each wave, report progress and start the next.

Many tasks with ordering between them run as described in `smarteverything-coding-waves`.

## UI work

- Use the full design process for new pages, new devices, large redesigns or when asked. For a small UI change, render the affected states and revisit any that change during fixes. Pages are real files (own CSS, scripts, images) tested headless (`mcp__playwright-mcp__` on a Linux computer, `http://127.0.0.1:PORT`), never `browser_read` or `browser_control`, which act on the person's device. To show it, or anything asked for in the Browser pane, call `browser_control` open with `port` (dev server) or `path` yourself; never give an address or localhost url as text.
- A planner writes a design document with screenshots of the current UI and defects. A builder makes a prototype as real page files and audits it (phone, tablet, desktop; light and dark; empty, many, long, offline data). A fresh reviewer critiques it with own screenshots beside the old UI, keeping its strengths. Resolve confirmed findings and verify the affected states, then start build slices with disjoint files from the document and prototype.
- Designers and builders may invent controls, interactions and visuals for a cohesive product, keeping useful existing features and the person's constraints.
- Not done until the built UI had a pixel review: real renders at phone and desktop width, light and dark, main states, against the prototype.

## Fixes in the person's own working tree

For code holding the person's uncommitted changes (this hub too):

1. Record the relevant starting state without staging it. Assign disjoint file ownership, coordinate or serialize shared-file edits, and preserve existing staged, unstaged and untracked work.
2. Fix and check the assigned files in place. Never overwrite, reset, stash, switch branches or stage another task's changes.
3. Report scoped changes and check evidence to the coordinator, who reviews the combined workspace and handles authorized commits, pushes and releases.

For SmartEverything issue fixes and local development, follow the owner-authorized stable-point commit/push process in `docs/STANDARDS.md`, section “Git handoff and releases”. Fetch and pull/merge remote `main`, resolve conflicts and verify the combined work before committing and pushing; pull it on the other machine before continuing. NAS is production, the desktop is development/build/test. Workers never commit or push. Other projects require their own explicit authorization.

A release of the owner's hub is never batched: each fix goes out alone with a rollback backup of the production server, migration check on a copy, build, release, verify, rollback on trouble, and the backup is deleted once the release is verified. Nothing else touches live data.

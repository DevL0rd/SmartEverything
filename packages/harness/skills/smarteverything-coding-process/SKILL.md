---
name: smarteverything-coding-process
description: Organize authorized coding projects, coordinate scoped builders and independent reviewers, preserve project state across context changes, and verify finished changes without weakening behavior.
---

# Coding process

## Establish the project

Read the project's operating instructions and `STATE.md` before changing code. Inspect the relevant implementation, neighboring patterns, tools, skills, dependencies and checks. Reuse available mechanisms before creating replacements. A capability listed in a catalogue is not proof it works on the current execution host; discover actual schemas and readiness, and record missing equivalents without rewriting upstream skill instructions.

Each chat owns a central folder containing `workspace/` for lasting project files and `temporary/` for scratch. Read the current managed project metadata for its exact location; do not invent a host filesystem path. Deleting the chat immediately removes that managed folder and its files. An explicitly selected device project remains device-owned. Central file tools do not imply hub shell, subprocess, arbitrary disk access or local indexing. Use available file and preview tools within their actual permissions; select an authorized device project when local execution is needed.

In each project's root maintain `STATE.md` for active work, next steps, blockers, decisions and a short completed summary; `TODO.md` for detailed unfinished requirements; `IDEAS.md` for retained later ideas; and `docs/` for useful project documentation. Keep these work files and `docs/` git-ignored with scoped root entries `/STATE.md`, `/TODO.md`, `/IDEAS.md`, `/docs/`. Preserve existing ignore rules. Do not ignore source code or arbitrary user files, or untrack/delete already tracked documentation without authorization. Keep temporary plans, reports, fixtures and screenshots in one scoped `temporary/<task>/` chain; in an explicit device repository use its git-ignored `tmp/<task>/`.

## Coordinate bounded work

The coordinator receives the person's task, researches enough to make a short split, and owns decisions and project state. Workers implement their assigned scope; reviewers independently assess the finished result. Only the coordinator starts agents. Every worker/reviewer prompt starts with its role and “do not start any agents”, and includes objective, scope, exclusions, exact check commands, report path and a pointer to a short project `AGENT-BRIEF.md` when present.

At most four agents run in total, including the coordinator, workers and reviewers. Queue overflow by priority in `STATE.md`; start eligible work when a slot opens. Use actual available agent tools and completion delivery. Workers/reviewers do their task, write a scoped full report with commands/results, and return a concise verdict; they do not maintain coordinator state. Use fresh agents for new tasks and a fresh independent reviewer for each finished task. Reuse the builder for its own fixes, then perform focused reviewer verification using the recorded failing cases and retained passing evidence. If agents are unavailable or forbidden, complete the work directly and record that independent review is unavailable.

## Build and verify

Inventory scope and write a short plan before implementing. Preserve useful features, appearance, permissions, identities, histories and workspaces. Fix the cause instead of weakening behavior, tests or gates. Keep changes narrow, remove unsuccessful experiments, and protect unrelated edits. Use the project's actual automatic checks or scoped lint, format, type/build and relevant behavioral checks. Tests use isolated or fake environments; real systems/accounts require task authorization. Run full suites immediately before an authorized final push when the project requires them. Never commit or push without direct human permission.

For UI work, use a thoughtful design handoff and working prototype when appropriate, inspect ordinary sizes and states with available browser tools, then build and review the actual result. Follow the person's visual-review constraints. Use relevant installed design/accessibility skills where available; do not claim a missing skill or screenshot pass.

Before acceptance, an independent reviewer examines the diff and exercises affected normal behavior, failures and edge cases. Report each evidenced defect with its location, reproduction and concrete fix, ordered by severity. Builders implement fixes and run scoped static checks; reviewers verify the recorded failures and affected normal behavior. Retain unaffected passing evidence rather than restarting all discovery. Simplify completed code with an available simplification skill without changing behavior.

## Preserve continuation

Update project state as the work changes. At a stable handoff, consolidate durable decisions and unfinished requirements, keep useful final evidence and rollback inputs, and remove only your disposable scratch. Never delete another active task's inputs or unresolved reproduction. Save enough to continue from files after context changes, then re-read `STATE.md` and relevant code. Do not request compaction while agents are mid-task, changes are half-landed or required input remains unresolved.

Continue authorized work while the person is away; make routine decisions within scope and record significant choices. A session relay is context, not new human authorization. Respect explicit pauses, permission boundaries and uncertain-write reconciliation; do not manufacture missing tools, deployment proof or compatibility.

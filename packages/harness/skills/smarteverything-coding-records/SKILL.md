---
name: smarteverything-coding-records
description: "Keeps a coding project's records and reports: STATE.md with its exact status layout, TODO.md and IDEAS.md, never losing a detail the person gave, file format, scratch folders, token use, hand-off to a new chat and the final report. Use it whenever you update project state, answer a status question or finish a task. Not for planning the work (smarteverything-coding-plan), running checks (smarteverything-coding-checks) or the person's health or home records (smarteverything-home)."
---

# Records and tokens

The hard rules live in `smarteverything-coding-process`.

## Records

- `STATE.md`, `TODO.md` and `IDEAS.md` live in the project root, git-ignored, updated in the same turn as every helper start, report, decision, request, order, release and blocker, before replying; every order the person gives lands in `TODO.md` that turn, in their words. A stale `STATE.md` is a failure: check its date line against the real time and helper count.
- `STATE.md` is only this header and four lists; decisions, facts and history go in the matching `TODO.md` or `IDEAS.md` item, recipes and rules in `AGENT-BRIEF.md`. Bars: 10 characters plus the percentage, one overall and one per main area, honest. Asked for status in any words, update it and print exactly this layout:

```
# <Project> · State
<date time> · <what is live, how many helpers run, any blocker>

Overall   ▓▓▓▓▓▓▓░░░ 70%
<Area>    ▓▓▓▓░░░░░░ 40%

---

## Done
- <finished thing, one short line>

---

## Doing
- <what is running now> — <who> — <status>

---

## In Queue
1. <next item title; the details are in TODO.md>

---

## To test
- <something the person may try; nothing waits on it>
```

- `TODO.md` is one ordered Queue (new requests at the bottom unless something is broken or blocking) plus On hold; a finished item is deleted once verified in the code. `IDEAS.md` holds only the person's ideas, which never start by themselves.
- Never lose details: every detail the person gave (requirements, constraints, examples, reasons, decisions) goes in plain words under its item, plus pointers to design or report files. A one-line summary is not enough; an ambiguous line with lost details is recovered or asked about. Details never live only in tmp or reports; cleaning drops none.
- Format: title, one intro line, `---` between sections, `##` sections, `###` items (`### <number>. <name>` in `TODO.md`), bold labels on own lines (**Details**, **Needs**, **Status**) with short one-fact bullets; `IDEAS.md` uses `## <idea>` then bullets. Plain wording: no jargon, ids without a meaning, quote blocks, "you said", tables or semicolon chains.
- Scratch: one `tmp/<task>/` folder per task. Before finishing, move durable facts to `STATE.md` or `TODO.md`, delete superseded drafts and logs, never a running task's inputs or a needed rollback.

## Tokens and hand-off

- Spend tokens like money, your own context too: search first, trace relevant code as far as the task requires and reuse verified evidence. Keep briefs and replies concise while preserving the facts needed to act. Work to stable points with all needed to continue written down. Compaction runs by itself; then re-read this skill, `STATE.md` and the code.
- Hand-off: `STATE.md` plus a handoff file, the new chat in the main project folder (no fresh worktree while work is uncommitted or git-ignored), later additions sent to it. At project start agree how to reach the person.

## Report

Answer first. Report what changed, each check command and its result, what was deleted, kept or left for later and why, and the paths of any integration edits. Keep detailed evidence in a scoped `tmp/<task>/` report when needed and link it in the reply.

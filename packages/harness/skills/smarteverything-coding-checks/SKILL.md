---
name: smarteverything-coding-checks
description: "Runs and hands off verification for code changes: the fast scoped lint at handoff, focused behaviour checks, who may run the static type check and when, typed lint with one package's declarations, builds, broad lint, suites and stalled commands. Use it before handing off work or when deciding which check to run. Not for reviewing a diff (smarteverything-coding-review), planning (smarteverything-coding-plan) or computer settings and processes (smarteverything-computers)."
---

# Checks

The hard rules live in `smarteverything-coding-process`.

Workers run one fast scoped lint pass on touched files at handoff. Report the exact focused behaviour checks the coordinator should run, including the reproduction and expected result. Reviewers may run scoped reproductions and verify fixes.

Nobody runs the static type check or compile check during development, not workers, checkers or sweeps; the release agent runs it once as the release gate before building or publishing, fixes the errors it finds with the smallest root-cause edits and reports them. A checker/integrator agent runs builds, broad lint and suites and shares the results with the coordinator; workers run only a fast scoped lint and the focused behaviour checks. Typed lint needs fresh package declarations: a checker may build the declarations of the one changed package only, never the whole-project type check before the release gate. Batch checks on stable changes and rerun the affected checks after relevant fixes. Workers hand off the changed paths and the reason a check is needed.

Use focused checks during development and full suites before a final push. Diagnose failures and run the checks needed to establish the cause and confirm the fix. Close headless browsers when done. If a command stalls or strains the machine, investigate, stop your own process by exact ID if needed and report the command, reason and any narrower check. A shared-code change ends with a scoped test that imports the changed modules. Use fake or isolated data.

For every SmartEverything AI repair, load `smarteverything-coding-process`, `smarteverything-coding-review` and `smarteverything-self-update` alongside this skill. Reproduce the failure with isolated data, verify the root-cause fix and affected normal behaviour, and resolve independent review findings before release. Always follow through with every required hub, Android and desktop update, using compatible OTA or native releases through supported tools. The owner's standing AI repair authorization includes release and necessary recovery without additional approval; it does not authorize a commit or push. Follow the self-update skill's status and recovery workflow, verify each release's recorded completion, and report publication separately from device-confirmed installation. Failed, pending or unavailable required delivery remains unfinished work.

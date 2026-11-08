---
name: smarteverything-coding-review
description: 'Reviews finished coding work with a fresh reviewer: what to hand the reviewer, severity-ranked findings with evidence and a concrete fix, programmatic audits and screenshots for new or redesigned UI, the numbered UI design review list, fix verification, and a self-review when no helpers are allowed. Use it when a change is finished and warrants independent review. Not for planning (smarteverything-coding-plan), running checks and the type check gate (smarteverything-coding-checks) or reviewing a public webpage (smarteverything-browser).'
---

# Review

The hard rules live in `smarteverything-coding-process`; the reviewer checks them.

- Use a fresh reviewer for finished work that warrants independent review. Group related changes where useful and start review as builders finish while independent work continues.
- Give it the changed files and the hard rules, not your conclusion. The reviewer checks the hard rules, reads the diff and affected paths, verifies behaviour and reports findings by severity with evidence and a concrete fix. Use scoped reproductions for suspected defects.
- New or redesigned UI: own screenshots of every screen and state at several sizes, light and dark, dummy data (empty, many, long); programmatic audits first (overflow, contrast, tap targets, text size, console errors), then only failing states plus a few samples, downscaled or cropped. For regression fixes, compare with the previous behaviour and render affected visual states when needed. Exercise touch and native UI regressions on the affected platform where possible, and report any platform or interaction you could not verify.
- A UI design review is one numbered list in a `tmp/<task>/` file of everything improvable (looks, spacing, hierarchy, consistency, states, copy, accessibility, performance, organization, naming, correctness, edge cases), by severity, each with evidence and a fix.
- Be strict on quality, looks, organization and bugs. Fix confirmed in-scope defects and verify each fix with the original reproduction and an affected normal case. Repeat where evidence shows a defect remains. Reuse passing evidence for unchanged behaviour.
- When the person agreed to work without helpers, do a fresh pass yourself: re-read the diff as a stranger against the hard rules and the task, before your notes; report confirmed findings and say no independent review was possible.

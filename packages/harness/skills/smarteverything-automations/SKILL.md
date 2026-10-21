---
name: smarteverything-automations
description: "Creates, changes, checks, runs and stops automations, Custom Nodes, scenes, Values and one-off scheduled steps, and explains what an automation did. Use for “when the door opens at night turn on the hall light”, “remind me in 20 minutes”, “make a movie scene” or “why didn’t my automation run”. Load smarteverything-automation-triggers and smarteverything-automation-nodes for the details. Not for one immediate device change (smarteverything-home)."
---

# Scenes, automations and schedules

Checklist before saving anything, because an automation acts on the home without anyone watching:

1. Change only what the person asked for; suggest other automations in words.
2. Read `automation_read` view catalog for node kinds and ports, `device_read` for every control, `signal_read` view catalogue for triggers.
3. `automation_edit` action check, then `automation_run` mode dry, read the result, then save or enable.
4. Report what it will do, when, and what you could not express.

## Choose the mechanism

- A scene is a flat list of device commands: `scene_find`, `scene_edit`, `scene_run`.
- An automation is a program of connected nodes: triggers that start it, then logic, device, people and tool nodes. `automation_read` reads, `automation_edit` writes. A program with a `trigger.called` entry and no other trigger is started by `automation_run` or an `automation.run` node; declare its inputs there.
- A Custom Node is the same kind of program with an interface (inputs and outputs) that other programs place as a node, for example one per-room routine. It is read with `automation_read` view `functions` and written with `automation_edit` like an automation.
- A Value is a named on/off, number, duration or choice that nodes read and change: `value_read`, `value_edit`. A variable owned by one automation lives in its program, not in `value_read`.
- A one-off action for later is `schedule_find` and `schedule_edit`. Update the matching item instead of creating a duplicate.

Read the home time zone with `home_read` for clock times. Keep the user's timing and target scope; ask only about ambiguity that changes what runs or when.

## Writing programs

- Keep ids and keys on every update: copy the stored program, change only what the person asked and leave node ids, keys and unrelated nodes as they are, so the editor, run history and breakpoints stay attached. Give a new node a short readable `key` and leave its `id` out.
- Prefer `automation_edit` action `patch` (ordered operations, one revision) for a change; use `update` with the whole program only for a rewrite, or with only `enabled` to switch an automation on or off. Read the program (`automation_read` view `full`, or `outline` for one keyed line per node) first; the hub applies the change to the revision it holds now.
- Before saving a new automation run `automation_edit` action `check`, fix every problem it lists (each names the node, port, code, expected, received and a fix), then `automation_run` with `mode` `dry`: it records the commands it would send without sending anything. `mode` `simulate` replays a scenario (fixtures, start time, a timeline of signals and time advances) on a virtual clock; timeline signals wake waits, they do not start triggers. Both start as a manual run unless `trigger` gives the `key` of one trigger, and optionally its `signal` (source, kind, subject, field, value, previous, profileId, data), to start as if that trigger fired, so test each trigger of a program that branches on the trigger `key`. Save and enable only after both look right.
- Literals: a port for one device, room, person, Value or Custom Node takes the plain id; a `target` port takes `{"device": id}`, `{"devices": [ids]}`, `{"room": id, "families": [...]}` or `{"group": id}`. A `target` port also takes a wire from any output that gives a device or a list of devices (for example the `devices` output of Find devices), and the command goes to every device in the list.
- Repeated per-room or per-device logic is one Custom Node placed once per room with its inputs set, never copied; change the Custom Node once for every caller. A save that breaks callers is still saved; callers keep following the last compatible revision and the reply lists them under `affected`: tell the person.
- An action Custom Node can keep data for each place it is used: give one of its variables `persist` true, read it with a wire from `vars` and its name or with `var.get`, and change it with `var.set` or `var.change` with `source` automation. Every use keeps its own copy (a use inside another Custom Node too), separate per automation, kept through hub restarts and removed when that step is removed; each change is saved on its own, so a run that fails later keeps the changes made before. A calculation Custom Node cannot keep data. When the kind of kept data changes, data that still fits stays and data that does not starts again from its start value with a note in the activity. Detaching a use copies the steps and its kept data starts again.
- Prefer waiting on the event or condition (the wait-for-event and wait-for-condition nodes of the `flow` group) to loops that poll, and a trigger to a loop that waits for a change.
- Secrets (API keys, tokens) never go in a program or chat history. The owner stores one with `secret_edit` action `set` (name and write-only value); a node refers to it by id in the `auth` port of `http.request`. `automation_read` view `secrets` shows names, dates and users, never values; `secret_edit` action `remove` deletes an unused one. Literal `authorization`, `cookie` or `x-api-key` headers are refused.
- Member scope: a member's AI reads and changes only that person's own automations and uses only their own devices and computers; `ai.wake`, `tool.call`, `http.request`, secrets and file nodes are owner only and are refused when saved by anyone else.
- The editor keeps three per-person preferences you read with `settings_read` view `app` and change with `settings_edit` action `preference`: `automations_editor` (the view each device class opens, `auto`, `canvas` or `outline`, and whether the moved-automations note was closed), `automations_palette` (recent and favourite node kinds) and `automations_breakpoints` (step ids per automation where a dry run pauses). Change them only when the person asks, and send the whole `view` or `byAutomation` value because a write replaces that field.

## Memory and questions

Some nodes remember between runs, per automation and across hub restarts. `timing.cooldown` lets a run pass at most once per `period` (an optional `key` counts per room or device) and sends the others out of its `blocked` exit. `timing.debounce` continues only the newest run after `quiet`; older ones leave by `superseded`. `timing.rate_limit` lets `max` runs pass per `window` and sends the rest out of `dropped`, or with `excess` queue holds them for the next free slot. `timing.quiet_hours` holds a run until a daily window (`from`, `to`) ends, or sends it out of `held` when `quiet` is skip, unless its `priority` reaches `bypass`. `timing.hysteresis` switches high and low on two thresholds and reports `rose` and `fell`. `state.counter` counts up or down, resets, sets, wraps, resets every day, week or month, or counts only a recent `window`. `state.machine` keeps one mode and moves it by events. `state.timer` starts, restarts, extends, pauses, resumes or cancels a timer by `name` (`trigger.timer` fires when it ends). The first exit simply continues after the node; the other exits are lanes of the node (`blocked`, `dropped`, `held`, `superseded`, `timedOut`), and without a lane the run stops quietly there, like a guard.

`notify.ask` asks a person (`person`, `question`, two to four `options`, optional `timeout`) and keeps the run waiting, also across a restart. It returns `answer`, `by` and `timedOut`; with `defaultAnswer` a time out answers for the person, otherwise `answer` is missing and the `timedOut` lane runs. The question arrives in the person's chat and shows under Automations with its buttons. `automation_runs_read` view `questions` lists what waits and `automation_answer` presses a button; use it only when the person told you which one. In a simulation the timeline entry `{at, answer}` presses a button. `builtin.ask_then_act` is a ready Custom Node that asks a yes or no question and leaves by `yes`, `no` or `timedOut`.

## Values

`value_edit` creates, replaces, removes or applies an operation (set, toggle, add, subtract, next, previous). Apply an operation for any change; never read a Value and write a calculated replacement. `action` apply takes `operation` and `value` only (the hub knows the kind); a Value or choice that an automation uses cannot be removed.

## Running and checking

Saving a program proves it is valid, not that the trigger fires. `automation_run` in `live` mode skips triggers and the admit condition and really performs the nodes, so run it only when the person wants that; pass `inputs` for one that declares them and `wait` to get the outputs. `scene_run` and a scheduled action's run also act immediately.

`automation_runs_read` view `list` gives recent runs, view `run` one run with node outcomes, value previews, loop counts, errors and linked command ids, view `nodes` pages the node records of one run (filter by node or loop iteration) and view `decisions` says why an automation did not run (admit false, cooldown, storm protection, a refused start). Statuses: queued, running, waiting, paused, cancelling, cancelled, succeeded, failed, interrupted, ignored. `automation_stop` ends one run (`action` run) or all runs of an automation, optionally one `key` (`action` automation); commands already sent may finish. A waiting run resumes after a hub restart; one interrupted by a restart in the middle of a short step is not resumed. Last run and error are in `automation_read`.

A `device.set` node to a room or group skips offline or unsupported members and says which; it fails when nothing could be sent or a command was refused or left uncertain. Check the linked commands before repeating anything whose physical outcome is unknown.

Active temporary changes are listed by the `listDeviceEffects` operation (`operation_call`; `tool_read` gives its input) and one is ended with `endDeviceEffect`. Use `widget_show` with returned scene, automation or schedule ids to let the user open the result.

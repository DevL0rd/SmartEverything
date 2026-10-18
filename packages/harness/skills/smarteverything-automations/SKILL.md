---
name: smarteverything-automations
description: Create or change SmartEverything scenes, automations (triggers, conditions, steps, reusable steps), Values and one-off scheduled actions; run or stop automations and read their history.
---

# Scenes, automations and schedules

## Choose the mechanism

- A scene is a flat list of device commands: `list_scenes`, `edit_scene`, `run_scene`.
- An automation is `when` (triggers), `onlyIf` (one condition) and `steps`: `list_automations`, `edit_automation`. With no triggers it is reusable steps that `run_automation` or a `run` step in another automation starts; declare `inputs` for the values the caller passes.
- A Value is a named on/off, number, duration or choice that steps and conditions read and change: `list_values`, `edit_value`.
- A one-off action for later is `list_scheduled` and `edit_schedule`. Update the matching item instead of creating a duplicate.

Read the home time zone with `get_home` for clock times. Keep the user's timing and target scope; ask only about ambiguity that changes what runs or when.

## Build from real contracts

Read `get_device` for every device control used in a step or condition. Read `read_signals` with view `kinds` for signal kinds and match keys, then view `values` for current examples; use `tool_details` for the exact input schema. Never invent a trigger from a device name. A computer is a device: its readings (battery level, processor and graphics load and temperature, memory and disk use, network rates, locked, front app, display count on) and controls (volume, mute, audio output, microphone mute, brightness, night light, Do Not Disturb, power mode, playback, power actions) are capability keys in `get_device`. Per-app sound and per-screen changes have no key: they are `audio` and `display` steps.

A match key with `values: null` has no fixed list and takes exact observed `data` or `details` values. Keep fixed lists for enumerated keys. Empty latest values do not prove a trigger unsupported. For camera sound events keep the discovered detection (Baby crying, Unusual sound, Loud sound are distinct; plain Sound is broad).

Speech triggers match literal words or a contiguous phrase of finalized speech. `list_speech_sources` shows the cameras, plugins and chats that can be chosen; leave `source` out for every authorized source. Bot speech is ignored unless `includeBots` is set. Only the person who saved a speech automation may change it.

## Editing

`edit_automation` takes `action` create (`name`, `definition`), update (`automationId`, any of `name`, `enabled`, `definition`) or remove. Read the automation with `list_automations` first and pass its `revision` as `expectedRevision` on update so a concurrent edit is refused instead of overwritten; after a refusal read again and edit on purpose. Keep unrelated triggers, steps and the enabled state.

Triggers (`on`): `time` (`at`, `days`), `every` (`minutes`), `sun`, `signal` (`kind` and match keys) and `speech`.

Steps: `set` (`target` device, devices, room or group; `control`; `to` a literal, a `from` reading or a Value; `percent`), `scene`, `wait`, `notify`, `ai`, `tool`, `audio`, `display`, `value`, `run`, `stop`, `if` (first matching branch, then `else`) and `repeat` (`times`, `while` or `until`, with `gapMs` and `limitMs`). Give `set` a `for` duration to make a temporary change: the control returns to its base after the time, when its `while` condition turns false, or when stopped; `by` adds to a number, `priority` orders overlapping changes. A run keeps going when a scene or automation it uses is edited.

`audio` (`computer`, `change`) takes the `set_computer_audio` action and its fields, such as `app_volume` with `app` and `level`, `app_mute`, `app_output`, `volume`, `mute` or `default`. `display` takes `change` `mode` (`output`, `width`, `height`, optional `refreshHz`), `scale`, `position`, `brightness` or `night_light`; HDR, rotation, main screen and turning screens off or mirroring them stay with a `tool` step. Read `get_computer` first for the exact names and the features the computer offers; a step the computer does not offer, a device that is not a computer, or (for a member) someone else's computer is refused when saved. Nobody is asked while it runs, so a screen change that can blank a screen (`mode`, `scale`, `position`) goes back by itself after 15 seconds unless someone keeps it at the computer. Add `keep: true` to those steps to keep it automatically once the hub has read the screen back and seen the change applied; if it does not match, the change is reverted at once and the step fails.

`mode` is single (default), restart, queue or parallel; queue needs `max`, parallel may take one. `key` names runs so `stop_automation` can end only those. Automations that call each other cannot form a cycle.

`ai` steps and `tool` steps are for the owner. An `ai` step (`person`, optional `chat`, `instruction`) wakes that person's AI with what happened. A `tool` step (`person`, `tool`, `args`) calls any enabled tool without an AI turn, using the exact arguments from `tool_details`; for example `speak` with `{"target":{"kind":"device","deviceId":"<camera id from read_presence>"},"text":"Exact words"}` says words once through a camera speaker. The app editor offers both, plus a ready "Say out loud" step for camera speakers, so anything you build there the person can open and change. Old tool names still work.

Every automation records who made it in `author` (`via` person or assistant, and `profile_id`), and a plugin in `origin`; `author` is null only for automations made before this was recorded. Never create, change, switch, run or remove an automation the person did not ask for, and never touch one only because it looks wrong: say what you noticed.

## Values

`edit_value` creates, replaces, removes or applies an operation (set, toggle, add, subtract, next, previous). Apply an operation for any change; never read a Value and write a calculated replacement. Replacing needs the current `revision` as `expectedRevision`; a Value or choice that an automation uses cannot be removed.

## Running and checking

Saving a definition proves it is valid, not that the trigger fires. `run_automation` skips triggers and `onlyIf` and really performs the steps, so run it only when the user wants that; pass `inputs` for reusable steps and `wait` to get the finished run. `run_scene` and a scheduled action's run also act immediately.

`read_automation_runs` with view `list` gives recent runs of an automation, view `run` one run with step outcomes and linked command ids. Statuses: queued, running, cancelling, cancelled, succeeded, failed, interrupted, ignored. `stop_automation` ends one run (`action` run) or all runs of an automation, optionally one `key` (`action` automation); commands already sent may finish. A run interrupted by a hub restart is not resumed. Last run and error are in `list_automations`.

A `set` step to a room or group skips offline or unsupported members and says which; it fails when nothing could be sent or a command was refused or left uncertain. Check the linked commands before repeating anything whose physical outcome is unknown.

Active temporary changes are listed by the `listDeviceEffects` operation (`list_operations`, `call_operation`) and one is ended with `endDeviceEffect`. Use `show_widgets` with returned scene, automation or schedule ids to let the user open the result.

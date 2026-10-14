---
name: smarteverything-automations
description: Create or change SmartEverything scenes, recurring automations and one-off scheduled actions with exact device and signal contracts.
---

# Scenes, automations and schedules

## Choose the mechanism

- A scene is a reusable action list: `list_scenes`, `edit_scene`, `run_scene`.
- An automation subscribes to triggers and checks conditions: `list_automations`, `edit_automation`.
- A one-off action for later uses `list_scheduled` and `schedule`. Reuse or update the matching item instead of creating a duplicate.

Read the home time zone with `get_home` for relative dates and clock times. Preserve the user's timing and target scope; clarify only ambiguity that changes what runs or when.

## Build from real contracts

Read `get_device` for every distinct device capability used in an action or condition. Use `read_signals` view kinds for supported signal kinds and match keys, then view values for current examples. Discover the selected tool's full variant schema through `tool_details`; do not invent a trigger format from a device name.

For camera events, keep the discovered event kind and exact detection match: Baby crying, Unusual sound and Loud sound are distinct detections within sound. Use the friendly match value labels returned by discovery; Sound without a detection filter remains broad. Preserve additional match keys, subject and timing when editing a compatible trigger.

Inspect the existing definition before changing it. Preserve unrelated triggers, conditions, actions and enabled state. For recurring AI work, carry the initiating profile and its allowed tools; automation delivery does not turn into owner authority or hub operating-system access. Add notifications, speech or messages only when the requested behavior includes them.

## Check what actually happened

The save result establishes a definition, not proof that the trigger fired. `run_automation` skips triggers and conditions and executes actions now: use it only when running those actions is authorized, never as a harmless validation step. `run_scene` also performs real commands. A scheduled action's run variant executes immediately; cancel and remove have different meanings.

Manual automation runs wait for command results. A timeout leaves the result uncertain; check command history before retrying.

Read last-run information from `list_automations`, step results from `list_scheduled`, and relevant `list_events` or `get_history` when diagnosing an observed run. Report individual failures and unresolved results. Use `show_widgets` with returned scene, automation or schedule IDs to make the saved result easy to open.

---
name: smarteverything-home
description: Control and organize SmartEverything devices, rooms, phones and watches; inspect capabilities and command outcomes.
---

# Home and devices

## Find the right target

Use `get_home` for room order, provider state, people and the home time zone. Narrow `find_devices` by room, family, capability or words; use returned IDs. Read `get_device` before a new control or action: capability keys, units, permitted values and danger levels belong to the actual device, not its display name. If a request is ambiguous between devices, resolve that ambiguity before sending a physical command.

## Act and report

- Discover the current schema with `tool_details`; `control_devices` accepts one change list across selected devices. An action without arguments uses null; an action with arguments uses an object matching its live argument schema and names. A writable setting uses its allowed value. Check every returned command status, error and new value. A pending command is not confirmed success; avoid repeating a physical action after an unknown outcome.
- Discover `get_device_groups` and `edit_device_group` to read or organize named groups. `control_device_target` applies a supported control to a canonical room, named group or explicit selection; use percent scaling for normalized brightness. Inspect per-device command outcomes and skipped offline, unsupported or deleted members. Membership resolves when the action runs, including automations; a partial result is not whole-group success.
- `update_device` changes presentation; `edit_room` organizes rooms. Removing a room leaves its devices unplaced. `sync_provider` refreshes a provider's device list; it does not repair account linking.
- Infrared button names come from `list_remotes`, then `press_remote_button`. Infrared commands need not prove the appliance changed state.
- Use `read_phone` or `read_watch` before `run_phone_action` or `run_watch_action`. Finding a phone rings at maximum volume even on silent; stop it through the same action with on false. Watch actions run through its phone and use the sports returned by the watch.
- Explain a changing measurement through `get_history` with the exact capability and a bounded time range. For context, `get_weather` reads home weather; `search_places` resolves location names without changing home settings.

For an enabled robot companion plugin, discover its read tool and actions view for native move options; use `get_device` and `control_devices` for the actual Move/action capability. Movement is available only during its conversation and within plugin scopes. Reading its state does not authorize speech or starting a conversation.

Use `show_widgets` when a live device, remote or weather card helps the person. Keep IDs from reads. Tool access stays with the initiating profile and host; a skill never grants device access or authorizes unrelated actions.

## Shelly Presence

For an enabled Shelly Presence plugin, discover its `read` tool first. One physical sensor provides occupancy, detected object count, illuminance and light category when its firmware exposes them; additional zones are ordinary child targets with their physical parent preserved. Occupancy and count are different measurements. Offline, disabled or faulted readings are unknown, not proof of an empty room. A removed and recreated zone gets a new target identity.

Use normal device commands for writable detection and typed sensor operations, or the discovered plugin operation tool with the sensor external ID and validated operation envelope. Inspect the runtime method and feature catalogue; firmware, operating mode and accepted settings determine which controls exist. Save partial settings with the accepted revision and read the returned outcome. An unknown result must not trigger an automatic repeat of calibration, firmware, reset, upload or other physical effects.

The live map uses an explicit paired-client viewer lease. Ordinary occupancy and crossing automations continue without opening a map or polling tracks. On-device schedules, webhooks and scripts are separate from SmartEverything automations. Script-library reads retrieve manufacturer source; saving, starting or evaluating code remains a separate requested operation.

## Microwave

Read the microwave before cooking: supported modes, power levels, per-mode time and temperature limits, door state and remote readiness come from the actual device. Changing a program setting does not start cooking. Use Start only when the selected mode supports it and the person requested cooking. Child lock or defaults without a setter are read-only; do not invent an unlocking command. Recipe and update actions follow the live argument schema; reuse a compatible recipe for unspecified stage details rather than inventing them. On-device programs remain separate from SmartEverything automations.

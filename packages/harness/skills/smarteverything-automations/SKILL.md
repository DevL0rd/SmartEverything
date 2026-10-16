---
name: smarteverything-automations
description: Create or change SmartEverything scenes, recurring automations, typed Values, reusable sequences and one-off scheduled actions; control owned runs using exact live contracts.
---

# Scenes, automations and schedules

## Choose the mechanism

- A scene is a reusable action list: `list_scenes`, `edit_scene`, `run_scene`.
- A named sequence reuses an ordered action tree with typed parameters: discover `list_automation_sequences`, `read_automation_sequence`, create/update/remove, start and stop variants.
- An automation subscribes to triggers and checks conditions: `list_automations`, `edit_automation`.
- A one-off action for later uses `list_scheduled` and `schedule`. Reuse or update the matching item instead of creating a duplicate.

Read the home time zone with `get_home` for relative dates and clock times. Preserve the user's timing and target scope; clarify only ambiguity that changes what runs or when.

## Build from real contracts

Read `get_device` for every distinct device capability used in an action or condition. Use `read_signals` view kinds for supported signal kinds and match keys, then view values for current examples. For automation Value and run signal kinds, request `automationRuntime` in the kinds query. Discover the selected tool's full variant schema through `tool_details`; do not invent a trigger format from a device name.

A match key with `values: null` has no fixed enumeration; it is supported and can match exact signal `data` or event `details` values. Use observed values or a confirmed provider contract, such as legacy Xiaomi button `action` values `single_press` and `long_press`; preserve fixed value lists for enumerated keys. Empty latest values or event history do not prove a registered trigger unsupported. Distinguish definition validation from observing a real press.

For camera events, keep the discovered event kind and exact detection match: Baby crying, Unusual sound and Loud sound are distinct detections within sound. Use the friendly match value labels returned by discovery; Sound without a detection filter remains broad. Preserve additional match keys, subject and timing when editing a compatible trigger.

Inspect the existing definition before changing it. Use `read_automation_revision` to read a coherent definition and revision before editing run policy or control settings, then pass its revision as `expectedRevision` to `edit_automation` with action `update`. A revision conflict requires a fresh read and an intentional edit; never drop policy or control settings to make a save pass. Preserve unrelated triggers, conditions, actions and enabled state. For recurring AI work, carry the initiating profile and its allowed tools; automation delivery does not turn into owner authority or hub operating-system access. Add notifications, speech or messages only when the requested behavior includes them.

## Values and run behavior

Discover `list_automation_values`, `create_automation_value`, `update_automation_value`, `apply_automation_value_operation` and `remove_automation_value`. Values support boolean, number, nonnegative duration in milliseconds and ordered choices with stable entry IDs. Apply an atomic operation for toggle, arithmetic or cycling; never read a value and write a calculated replacement. Definition edits need the current Value revision. Preserve bounds and overflow behavior; deleting a selected choice requires an explicit valid replacement, and referenced Values or choices cannot be removed.

Use explicit Single, Restart, bounded Queue or bounded Parallel run policy when requested. Definitions without a policy retain legacy parallel behavior. Structured actions support atomic Value updates, ordered first-match Choose branches with optional Otherwise, bounded count/while/until Repeat, synchronous sequence calls and Stop. While checks before its body; Until checks after. A repeat needs an explicit duration limit and interval. Sequences cannot refer to themselves or form cycles. New Steps programs use Single by default; preserve an existing omitted policy unless an explicit change is requested.

## Structured actions and reusable sequences

Use stable node and branch IDs when updating or moving existing steps; creation and duplication assign fresh identities. Steps remain ordered within each block. Duplicate remaps nested node and branch identities; moving a step preserves them. Local Undo/Redo changes the draft, not a saved revision. Preserve a saved tree completely and pass the current revision for a deliberate replacement. A definition containing opaque fields this app would discard is preserved read-only; use a compatible app rather than reconstructing it. The Steps editor opens nested Choose branches and Repeat bodies, typed inputs and reusable sequences through shared forms. Values and Sequences are under Automations. Create or open a compatible Value/sequence from its field; the local library sheet keeps the caller draft and selects the saved result on return. Cancel inserts no reference. Field, parameter, nested node and owned-run search results open their actual editor target without replacing the active draft. Definition changes use guarded revisions; conflicts keep the local draft and require intentional reconciliation. Structured drafts must be saved before a real test. Saved tests return owned run details with Stop; legacy flat draft tests still skip waits and AI.

New command inputs may use a typed literal, Value, sequence parameter or supported readable device capability, with an optional numeric add/subtract offset and explicit units/bounds. A command uses either its legacy literal value or a binding. Bind object command arguments by the real descriptor-defined field names and primitive types; preserve enum choices, required arguments and optional omissions. Complex argument literals continue through the existing schema form. A capability read never grants command authority. Do not invent expression strings, cooking/start commands or unavailable controls.

Use `target_command` for a room, named device group or explicit device selection, using the exact discovered target schema. Discover groups with `get_device_groups`; use capability keys or presented roles from actual member devices. Membership resolves when each step executes, including later room or group edits. Literal values and typed bindings use the same shared target planner as direct controls; `scale` percent normalizes numeric levels. Offline and unsupported members are explicitly reported by device ID in the step outcome; supported members can succeed while other members are skipped. A missing or empty target, no supported commands, a refused command or an uncertain physical outcome fails the step. Inspect linked command IDs and skip notes before retrying. Parent cancellation also stops future group dispatches; already sent commands may finish.

Read a sequence before updating or deleting it and supply `expectedRevision`. Parameter names and types must match the saved sequence. Calls await their nested owned run, share parent cancellation and retain both saved and initiating authorization. AI actions inside any branch, repeat or called sequence remain owner-only. Discover exact input schemas; do not copy a legacy flat editor payload over a structured tree.

`start_automation_sequence` executes real actions and returns the owned run immediately. Read sequence history through `list_automation_runs` with its ID as `automationId` and `targetType` sequence; run details identify the target type and parent run. `stop_automation_sequence` cancels its active and queued runs. Keep starts and stops within the user's requested scope.

## Check what actually happened

The save result establishes a definition, not proof that the trigger fired. `run_automation` skips triggers and conditions and executes actions now: use it only when running those actions is authorized, never as a harmless validation step. `run_scene` also performs real commands. A scheduled action's run variant executes immediately; cancel and remove have different meanings.

`start_automation` starts the same saved action execution and returns an owned run immediately. Use `list_automation_runs` or `read_automation_run` for status, step outcomes and linked command IDs; request `runDetails` for sequence/parent metadata. History is bounded to the latest 200 owned runs, with older legacy events separate. Status is queued, running, cancelling (Stopping), cancelled, succeeded (Completed), failed, interrupted or ignored. Trace IDs belong to the saved revision; do not attach them to guessed current editor nodes. Use `stop_automation_run` or `stop_automation_runs` to cancel future actions. These are real runs and controls, so use them only within the requested scope. Stop is idempotent; already dispatched commands or tool calls may still complete. Interrupted runs are not resumed or replayed after a hub restart.

Manual automation runs wait for command results. A timeout leaves the result uncertain; check command history before retrying.

Read last-run information from `list_automations`, step results from `list_scheduled`, and relevant `list_events` or `get_history` when diagnosing an observed run. Report individual failures and unresolved results. Use `show_widgets` with returned scene, automation or schedule IDs to make the saved result easy to open.

## Temporary changes and capability handoffs

Discover `list_device_effect_support` for the exact readable/writable state controls and targets before creating a `temporary_effect` through an automation definition. Use Set for an absolute value or Add for numeric contribution, a bounded lifetime, optional while conditions and deliberate priority. The step waits until expiry, a false condition, Stop or End. Overlapping contributions compose over the current durable base by priority then activation order; never implement capture → delay → restore.

Inspect active contributions with `list_device_effects`, command resolution with `read_device_effect_command`, and end a selected contribution with `end_device_effect`. Ordinary permanent writes keep active contributions. Only use explicit `effect_policy` cancel on `send_command`/`send_commands` when the user intends to end them. Command history keeps the original requested value separately from applied resolution metadata. Restart interrupts effects; uncertain writes are never replayed and cleanup cannot gain new authority.

Steps preserves saved temporary effects and speech triggers while their dedicated authoring controls remain unavailable. Do not infer connected-hub support from a saved union or an editor label. Finalized speech source authorization and matching remain a separate capability handoff. Height/presence correlation and Flow authoring are deferred.

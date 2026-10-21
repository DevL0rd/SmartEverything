---
name: smarteverything-settings
description: "Changes SmartEverything settings: preferences, home location and time zone, the assistant’s name, voice and instructions, AI defaults and budget, switched-off tools, the firewall; reads AI costs, model prices, people and access; points at things in the app; finds the tool for an unusual job. Use for “make the assistant speak slower” or “what did the AI cost this month”. Not for device settings (smarteverything-home) or plugins (smarteverything-plugins)."
---

# Settings, discovery and the app

Read before you change: `settings_read` with the area's view gives current and allowed values; `settings_edit` changes one area, `settings_sync` fetches data now or fixes the firewall. A setting change applies at once for everyone it covers, so change only what the person asked.

## Find tools and operations

`home_search` finds home entities, capabilities, settings and operations (app search, not internet search). `tool_search` finds enabled tools by words and `tool_read` returns the exact input schema; call a discovered tool directly or through `tool_call`.

For a capability without a tool, narrow `tool_search` by area or search, request schemas with exact camelCase operation names, then use `operation_call` with the shown path, query and body. A tool name is not an operation name. Human-only entries explain a boundary the generic call cannot cross. Re-discover after tools or plugins change.

## Settings, models and usage

Read `settings_read` for the area before `settings_edit` and keep unrelated values. Apply a `place_search` result as the home location only when asked. Linking providers, credentials and access grants happen in the app.

The automations editor keeps three per-person preferences, `automations_editor`, `automations_palette` and `automations_breakpoints`, changed with `settings_edit` action `preference` (see `smarteverything-automations`).

The preferences `device_alerts` (ids of devices and cameras whose doorbell, call, alarm and leak alerts do not reach the person's phones; send the whole list), `camera_notifications` and `shared_clipboard` (`enabled`) are per person. `camera_notifications` decides which camera events notify the phones: `kinds` (motion, person, pet, sound, baby_cry, doorbell, alarm, offline, clip_ready) are the defaults for every camera, `cooldownMinutes` (default 2) is how long a camera stays silent for a kind after notifying, `quiet` is an optional `{from, to}` window of HH:MM in the home time zone, and `cameras` holds per-camera overrides keyed by the camera id from `device_find` (`kinds` only for the ones that differ, `cooldownMinutes` or `quiet` null to follow the default, quiet `"off"` for none). Offline and failed-recording reports are one `offline` notice at most once an hour that is replaced quietly when the camera is back; only baby_cry, doorbell and offline are on by default. Send only the keys that change; nested objects such as `kinds` and `cameras` are replaced whole, so read first and send the full object. The shared clipboard holds the text last copied on any of the person's devices: `tool_search` finds `readSharedClipboard` and `writeSharedClipboard`; read it only when asked and write only text the person wants on their devices.

The firewall: `settings_read` view firewall lists the openings cameras and devices need, which are missing and the plan. `settings_sync` action fix_firewall adds the missing rules (owner only) with passwordless sudo on the server computer and returns one result per rule (added, already there, failed with the firewall's message). When the result says the server cannot elevate, give the person its `commands` block to run on that computer and read the firewall again afterwards with action firewall.

`model_read` shows models and prices; `usage_read` gives totals, series or the ledger. Do not change model, budget or tool defaults just to make another task work.

## Navigation and showing things in the app

The navigation (the phone bar and the desktop sidebar) is the `navigation` preference, with `navigation_device` for one device only. Read `settings_read` for its current `items` and `hidden`, then write the whole list back with `settings_edit` action preference; `items` null resets to the default order. Settings and chats cannot be pinned.

`app_show` opens a page, points at one thing on it (`focus`) or clears the pointer (`dismiss`) in the person's open app. Use it only when they ask to see, open, find or be shown something, or to see where a pin went; never open pages unprompted. Targets come from reads (sections, pages, devices, rooms, cameras, groups, scenes, automations, settings pages, chats). It works only while their app is open in front: when the result says it was not connected, not in front or did not answer, say so and offer a link with `widget_show` instead. After `open`, say what was opened; use `dismiss` when they say ok, got it or close that. A member's AI can drive only that person's own apps; the owner's may name another app with `appId`.

## People and access

A personal MCP connection made read only (the owner chooses it when making the key) lists only the tools that read and is refused any change on the server, so a refusal that says the connection is read only is final: tell the person the owner can make a connection that may change things.

The owner decides what each person may reach. `person_edit` adds, renames or removes a person (and links their scale slot). Through `tool_search`, `listPersonAccess` shows every person's role, areas, devices, models, channels, AI budget, conditions and end time; `changePersonAccess` edits one person; `revokePerson` ends their access now, unpairing all their devices and stopping their chat accounts (a new end time lets them back in); `listAccessAudit` shows refusals and owner changes. These are owner-only and stay with the owner. Limits apply to a person who is not an owner, in the app and to their AI alike: an area they lack, a device outside their devices, a model outside their models, a channel outside their channels, a spent budget with the hard stop on, a closed schedule or a home-only rule when away. Read the person first and change only the named field. If a call is refused because of someone's limits, say which limit it was and that the owner can change it; do not look for another route around it. When the person wants what a limit refuses, offer to ask the owner: `createAccessRequest` (kind area, device, model or budget, the id or amount as target when known, a short note) tells the owner at once, and `listAccessRequests` shows its answer. The owner reads requests with `listAccessRequests` (all people) and answers with `decideAccessRequest` (approve for ever or until a time, or deny; name the target when the request has none): an approval widens that person's limits at once and a timed one is taken back at the end time. Never approve a request unless the owner told you to.

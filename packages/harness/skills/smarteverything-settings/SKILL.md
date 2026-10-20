---
name: smarteverything-settings
description: Change SmartEverything app, home or AI settings, look up usage and prices, manage plugins, skills and integrations, and find the right tool or app operation when no tool is obvious.
---

# Settings, discovery and integrations

## Find tools and operations

`search_everything` finds home entities, capabilities, settings and operations (app search, not internet search). `search_tools` finds enabled tools by words and `tool_details` returns the exact input schema; call a discovered tool directly or through `call_tool`.

For a capability without a tool, narrow `list_operations` by area or search, request schemas with exact camelCase operation names, then use `call_operation` with the shown path, query and body. A tool name is not an operation name. Human-only entries explain a boundary the generic call cannot cross. Re-discover after tools or plugins change.

## Settings, models and usage

Read `get_settings` for the area before `update_settings` and keep unrelated values. Apply a `search_places` result as the home location only when asked. Linking providers, credentials and access grants happen in the app.

The automations editor keeps three per-person preferences, `automations_editor`, `automations_palette` and `automations_breakpoints`, changed with `update_settings` action `preference` (see `smarteverything-automations`).

The preferences `device_alerts` (ids of devices and cameras whose doorbell, call, alarm and leak alerts do not reach the person's phones; send the whole list), `camera_notifications` and `shared_clipboard` (`enabled`) are per person. `camera_notifications` decides which camera events notify the phones: `kinds` (motion, person, pet, sound, baby_cry, doorbell, alarm, offline, clip_ready) are the defaults for every camera, `cooldownMinutes` (default 2) is how long a camera stays silent for a kind after notifying, `quiet` is an optional `{from, to}` window of HH:MM in the home time zone, and `cameras` holds per-camera overrides keyed by the camera id from `find_devices` (`kinds` only for the ones that differ, `cooldownMinutes` or `quiet` null to follow the default, quiet `"off"` for none). Offline and failed-recording reports are one `offline` notice at most once an hour that is replaced quietly when the camera is back; only baby_cry, doorbell and offline are on by default. Send only the keys that change; nested objects such as `kinds` and `cameras` are replaced whole, so read first and send the full object. The shared clipboard holds the text last copied on any of the person's devices: `list_operations` finds `readSharedClipboard` and `writeSharedClipboard`; read it only when asked and write only text the person wants on their devices.

The firewall: `get_settings` view firewall lists the openings cameras and devices need, which are missing and the plan with its revision. `update_settings` action fix_firewall with that revision adds the missing rules (owner only) with passwordless sudo on the server computer and returns one result per rule (added, already there, failed with the firewall's message). When the result says the server cannot elevate, give the person its `commands` block to run on that computer and read the firewall again afterwards with action firewall. A stale revision changes nothing: read the firewall again.

`read_models` shows models and prices; `read_usage` gives totals, series or the ledger. Do not change model, budget or tool defaults just to make another task work.

## Navigation and showing things in the app

The navigation (the phone bar and the desktop sidebar) is the `navigation` preference, with `navigation_device` for one device only. Read `get_settings` for its current `items` and `hidden`, then write the whole list back with `update_settings` action preference; `items` null resets to the default order. Settings and chats cannot be pinned.

`show_in_app` opens a page, points at one thing on it (`focus`) or clears the pointer (`dismiss`) in the person's open app. Use it only when they ask to see, open, find or be shown something, or to see where a pin went; never open pages unprompted. Targets come from reads (sections, pages, devices, rooms, cameras, groups, scenes, automations, settings pages, chats). It works only while their app is open in front: when the result says it was not connected, not in front or did not answer, say so and offer a link with `show_widgets` instead. After `open`, say what was opened; use `dismiss` when they say ok, got it or close that. A member's AI can drive only that person's own apps; the owner's may name another app with `appId`.

## People and access

The owner decides what each person may reach. `edit_person` adds, renames or removes a person (and links their scale slot). Through `list_operations`, `listPersonAccess` shows every person's role, areas, devices, models, channels, AI budget, conditions and end time; `changePersonAccess` edits one person; `revokePerson` ends their access now, unpairing all their devices and stopping their chat accounts (a new end time lets them back in); `listAccessAudit` shows refusals and owner changes. These are owner-only and stay with the owner. Limits apply to a person who is not an owner, in the app and to their AI alike: an area they lack, a device outside their devices, a model outside their models, a channel outside their channels, a spent budget with the hard stop on, a closed schedule or a home-only rule when away. Read the person first and change only the named field. If a call is refused because of someone's limits, say which limit it was and that the owner can change it; do not look for another route around it. When the person wants what a limit refuses, offer to ask the owner: `createAccessRequest` (kind area, device, model or budget, the id or amount as target when known, a short note) tells the owner at once, and `listAccessRequests` shows its answer. The owner reads requests with `listAccessRequests` (all people) and answers with `decideAccessRequest` (approve for ever or until a time, or deny; name the target when the request has none): an approval widens that person's limits at once and a timed one is taken back at the end time. Never approve a request unless the owner told you to.

## Plugins

`read_plugins` lists installed plugins with their tools, data, logs, people and the widgets and pages they add. `call_plugin_tool` runs an enabled plugin tool and `update_plugin` changes or restarts one plugin. Read status first and take units from its schema.

A plugin adds widgets and pages as data, live while it is on and gone when it is off. A widget is a board type named `pluginId.widgetId` (an id that already starts with the plugin id is used as it is): `show_widgets` kind `board` shows it in a chat, and the board layout operations from `list_operations` place it on a board. A page opens with `show_in_app` or pins to the navigation with the route key `plugin.pluginId.pageId`. Its buttons, switches and sliders do what `call_plugin_tool` does for their tool. Only the owner installs, switches on or trusts a plugin and switches its tools.

## Skills and plugin sources

Skills and plugins are stored once on the Home Hub and reach every machine. Through `list_operations`, `discoverAiHarnessExtensions` browses a git URL, GitHub link, Claude `marketplace.json` repository or the official sources, `resolveAiHarnessSkill` looks inside one, `installAiHarnessExtensions` installs chosen items (owner), `writeAiHarnessSkill` saves a skill written in the app, `changeAiHarnessExtension` switches an item on or off or confirms a plugin that runs hooks or MCP servers (owner), and `removeAiHarnessExtension` removes it. `readAiHarnessSkillUpdates`, `replaceAiHarnessSkillUpdates` and `updateAiHarnessSkills` manage the daily refresh of git-installed items. Read configuration readiness to confirm a change reached each machine. Scripts in a skill run on a selected execution computer, not on the hub.

Use `show_widgets` for a status board or a settings link; a link helps the person finish a human-only step and is not proof it was done.

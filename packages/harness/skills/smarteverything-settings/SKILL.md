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

The preferences `device_alerts` (ids of devices and cameras whose doorbell, call, alarm and leak alerts do not reach the person's phones; send the whole list) and `shared_clipboard` (`enabled`) are per person. The shared clipboard holds the text last copied on any of the person's devices: `list_operations` finds `readSharedClipboard` and `writeSharedClipboard`; read it only when asked and write only text the person wants on their devices.

`read_models` shows models and prices; `read_usage` gives totals, series or the ledger. Do not change model, budget or tool defaults just to make another task work.

## People and access

The owner decides what each person may reach. `edit_person` adds, renames or removes a person (and links their scale slot). Through `list_operations`, `listPersonAccess` shows every person's role, areas, devices, models, channels, AI budget, conditions and end time; `changePersonAccess` edits one person; `revokePerson` ends their access now, unpairing all their devices and stopping their chat accounts (a new end time lets them back in); `listAccessAudit` shows refusals and owner changes. These are owner-only and stay with the owner. Limits apply to a person who is not an owner, in the app and to their AI alike: an area they lack, a device outside their devices, a model outside their models, a channel outside their channels, a spent budget with the hard stop on, a closed schedule or a home-only rule when away. Read the person first and change only the named field. If a call is refused because of someone's limits, say which limit it was and that the owner can change it; do not look for another route around it.

## Plugins

`read_plugins` lists installed plugins with their tools, data, logs and people. `call_plugin_tool` runs an enabled plugin tool and `update_plugin` changes or restarts one plugin. Read status first and take units from its schema.

## Skills and plugin sources

Skills and plugins are stored once on the Home Hub and reach every machine. Through `list_operations`, `discoverAiHarnessExtensions` browses a git URL, GitHub link, Claude `marketplace.json` repository or the official sources, `resolveAiHarnessSkill` looks inside one, `installAiHarnessExtensions` installs chosen items (owner), `writeAiHarnessSkill` saves a skill written in the app, `changeAiHarnessExtension` switches an item on or off or confirms a plugin that runs hooks or MCP servers (owner), and `removeAiHarnessExtension` removes it. `readAiHarnessSkillUpdates`, `replaceAiHarnessSkillUpdates` and `updateAiHarnessSkills` manage the daily refresh of git-installed items. Read configuration readiness to confirm a change reached each machine. Scripts in a skill run on a selected execution computer, not on the hub.

Use `show_widgets` for a status board or a settings link; a link helps the person finish a human-only step and is not proof it was done.

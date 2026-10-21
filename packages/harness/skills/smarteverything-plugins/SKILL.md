---
name: smarteverything-plugins
description: "Uses and manages plugins: their status, tools, data and log, switching a plugin or tool on or off, settings, restart, running a plugin tool, the router (who is home), AdGuard Home, Syncthing, Shelly presence, OpenRGB profiles, Discord, and skill and plugin sources. Use for “who is home”, “pause ad blocking”, “load my RGB gaming profile” or “restart the Discord plugin”. Not for the home’s own devices (smarteverything-home) or app settings (smarteverything-settings)."
---

# Plugins

`plugin_read` comes first: it lists each plugin, its tools with their inputs and whether it is switched on. A plugin tool runs through `plugin_call`, or by name with `tool_call` after `tool_read`. Do only what the person asked; a plugin's own powers and the owner's switches decide what is allowed.

## Plugins

`plugin_read` lists installed plugins with their tools, data, logs, people and the widgets and pages they add. `plugin_call` runs an enabled plugin tool and `plugin_edit` changes or restarts one plugin. Read status first and take units from its schema.

A plugin adds widgets and pages as data, live while it is on and gone when it is off. A widget is a board type named `pluginId.widgetId` (an id that already starts with the plugin id is used as it is): `widget_show` kind `board` shows it in a chat, and the board layout operations from `tool_search` place it on a board. A page opens with `app_show` or pins to the navigation with the route key `plugin.pluginId.pageId`. Its buttons, switches and sliders do what `plugin_call` does for their tool. Only the owner installs, switches on or trusts a plugin and switches its tools.

## Home server devices

- Home server devices (AdGuard, Syncthing, router, Shelly presence) act through their plugin tools (`plugin_read`, `tool_search`): pause or resume ad blocking with `pause_protection` and `resume_protection`, syncing with its pause tool, and Shelly live tracking with its live view tool (give a holder name, and turn it off again when done).
- Who is home comes from the router plugin (`tool_search`): `who_is_home` lists every known person with home or away, since when, who arrived last and who left last. A person is home when any linked device is on the network (after the router's own grace period against Wi-Fi sleep) or their paired phone reports the place Home; it is for display and automations only, never for choosing the server route. The owner names a network device as a person without an account with `link_device` (`newPerson`, or `person` from `who_is_home`; the MAC comes from the router's device list), links several devices to one person, and uses `manage_person` to add, rename, remove or switch off tracking for one person. A member can read presence but not change it.
- PC RGB lighting (the OpenRGB plugin): each motherboard, RAM, fan, strip or keyboard controller is a `light` device named by OpenRGB, and a controller with several zones also has one light per zone (its `parentExternalId` is the controller). Use `device_control` with `power`, `brightness`, `color` and, on the controller, `light_effect` (its options are the controller's OpenRGB modes); power off writes black and power on restores the last colour, and colouring a light running an effect switches it to a colour mode first. OpenRGB gives no change notifications for single colours, so a colour set in the OpenRGB window shows after the next device-list update. The lights are offline while the OpenRGB SDK server is not running or the plugin is off (`plugin_read`). Saved profiles belong to the plugin's tools (`plugin_read`, `tool_search`): `status` lists them with the lights, `load_profile` applies one by name, `save_profile` stores the current colours (owner only) and replaces a profile of the same name.

## Skills and plugin sources

Skills and plugins are stored once on the Home Hub and reach every machine. Through `tool_search`, `discoverAiHarnessExtensions` browses a git URL, GitHub link, Claude `marketplace.json` repository or the official sources, `resolveAiHarnessSkill` looks inside one, `installAiHarnessExtensions` installs chosen items (owner), `writeAiHarnessSkill` saves a skill written in the app, `changeAiHarnessExtension` switches an item on or off or confirms a plugin that runs hooks or MCP servers (owner), and `removeAiHarnessExtension` removes it. `readAiHarnessSkillUpdates`, `replaceAiHarnessSkillUpdates` and `updateAiHarnessSkills` manage the daily refresh of git-installed items. Read configuration readiness to confirm a change reached each machine. Scripts in a skill run on a selected execution computer, not on the hub.

Use `widget_show` for a status board or a settings link; a link helps the person finish a human-only step and is not proof it was done.

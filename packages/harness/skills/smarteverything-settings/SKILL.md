---
name: smarteverything-settings
description: Find SmartEverything features and settings, inspect usage and enabled plugins, and discover exact tool or app-operation schemas.
---

# Settings, search and integrations

## Discover without loading everything

Use `search_everything` for home entities, capabilities, preferences and operations; this is app search, not internet search. `search_tools` finds enabled tools by words, then `tool_details` returns the exact input and variants. Call a discovered tool directly when exposed or use `call_tool` with its name and matching arguments when that dispatcher is available.

For a capability without a dedicated tool, narrow `list_operations` by area or search. Request schemas with operations containing the returned exact camelCase operation names, then call `call_operation` with the shown path, query and body structure. A served snake_case tool name is not an operation name. Human-only entries explain the boundary; the generic operation tool cannot bypass it. Re-discover after tools or plugins change instead of relying on an old catalogue.

## Read before changing

Read `get_settings` for the relevant area before `update_settings`. Preserve unrelated values. `search_places` can resolve a home location; apply it only when changing the location was requested. Provider linking, pairing, credentials, access grants and computer scopes stay in the person's app/native flows.

`read_models` describes available models and prices; `read_usage` provides totals, time series or the ledger. Prices and usage are observed data, not proof that a subscription route or independent image account is ready. Do not change model, budget or tool defaults just to make another workflow succeed. Personality, reply length and formatting are settings choices, not reasons to edit these product skills.

## Inspect integrations

`read_plugins` lists installed plugins, powers, settings, tools, data, logs and people. `call_plugin_tool` invokes an enabled discovered tool; `update_plugin` changes or restarts only the requested integration. Installing code, changing trust or importing credentials is not implied by diagnosis. Router, AdGuard, Syncthing, Discord and robot companion tools vary with installation and grants. Read status first; interpret units from its schema. Router restarts disconnect the home, AdGuard changes affect everyone, and Syncthing override/revert can replace files across devices.

The robot companion's forget tool starts its conversations over and leaves them archived; use it only for a requested memory reset, not as a connection repair.

Use `show_widgets` with returned IDs for a status board or settings link. A link can help the person complete a human-only step; do not claim the link performed it.

## Shelly Presence settings

Connected Shelly settings and zone creation live under that sensor's Device Settings. Initial Wi-Fi setup is completed in the Shelly app. Adding a configured sensor uses its local HTTP or HTTPS origin; discovery and enrollment are owner actions in the app. Controller CA certificates and optional mutual TLS client certificate/key use the existing encrypted secret store. Never disable TLS verification or expose passwords and private keys in search, logs, exports or command history.

Discover the plugin's typed `read`, `operate`, `operate_privileged`, `operate_destructive` and `operate_access` tools rather than guessing RPC methods. Ordinary writes, owner operations and access grants have separate permissions. Access-granting changes require a person in the app; an automation or tool dispatcher cannot bypass that boundary. Presence room geometry, detection, light, network, integrations, system, on-device schedules/actions/scripts, virtual/BTHome components, stored values and diagnostics are runtime-gated native settings pages with focused search links.

Use configuration revisions for settings, the resource's own revision for on-device schedules/webhooks, and the initial etag for stored values. Preserve drafts on conflicts. Firmware file transfer uses an explicit start and acknowledged byte offsets; cancellation uses the discovered abort action. Certificate uploads may require reboot, and changing Wi-Fi, firmware mode or access credentials can disconnect the sensor. Report accepted writes separately from unavailable readback.

## Shared skills and extension discovery

Discover `discoverAiHarnessExtensions` through `list_operations` for separate bounded online Skills and Extensions pages. Anthropic skills resolve at an immutable repository commit; restricted or unknown licenses are excluded from shared acquisition. Extensions includes the approved code-simplifier, frontend-design and feature-dev packages plus an independent community marketplace. A listing or upstream install command does not grant runtime admission. Preserve page snapshots and use returned source/freshness/error information. Do not execute registry commands.

`readAiHarnessSkillUpdates`, `replaceAiHarnessSkillUpdates` and `updateAiHarnessSkills` expose the shared automatic skill and approved-package updater, its saved toggle and Update now. Each Claude source group has its own All on/off control; imported skills use `claude_skills_enabled`, and packages use their adapter entry enablement. Switching a source group off preserves selected immutable assets and leaves bundled, user and workspace skills available; automatic updates never turn it back on. Automatic updates default on, retain unchanged upstream files, resources, license notices and separate provenance metadata, and use the existing desired configuration rollout. Codex skills are not fetched. Manual updates work while automatic updates are off. An accepted central revision is not proof every execution device has applied it; read configuration readiness separately. The native loader uses the shared managed asset store and ordinary SmartEverything capability metadata. It does not require Claude Code or execute arbitrary marketplace installers. Discovery and instructions do not grant new tools or account access.

Verified shared instruction assets are also available on the Hub. Its provider reads only the managed cache; personal and workspace roots stay on execution computers. Loading instructions or their resource references does not authorize Hub shell access or script execution. Run required scripts on an explicitly selected, authorized execution computer with the required commands available.

`smarteverything-coding-process` supplies the project's coding workflow separately from upstream skill content. No official generic Anthropic coding skill source has been identified. A configured source may receive the managed process appendix at effective load without changing its immutable upstream files; do not claim that target is configured merely because the process skill exists.

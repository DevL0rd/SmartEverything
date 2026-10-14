---
name: smarteverything-health
description: Read and log SmartEverything health, meals, water, body readings and goals for the authorized person.
---

# Health, food and water

## Resolve person and period

Use `list_people` for profile IDs and current goals. Keep the initiating profile: an omitted profile has a runtime default and must not silently redirect a request about a named person. Another person's ID does not grant access to their private records.

Use `get_home` for the time zone, then `read_health` for the relevant view: summary, daily, latest, records, entries, types or watch_days. Bound records to the requested period. Summary energy_in is calories eaten; source coverage and missing records can limit a comparison. Distinguish an absent value from zero and observations from medical conclusions.

## Log exactly once

Discover `log_health` and the relevant health type before writing. Measurements use their declared units; sessions may require an end time. Preserve the user's time and duration. Read existing entries before replacing or removing one; repeated source records are not evidence that a new manual entry is needed.

For meals, `find_food` searches saved foods and Open Food Facts by name or barcode; its saved view includes recent foods. Match the product and portion basis before `log_food` what food. Use `edit_food` to save or change a reusable food, not to represent a meal already eaten. `log_food` what water records hydration. Do not invent nutrition numbers when a label or lookup is unavailable; ask for the missing facts or clearly describe an estimate if the person requested one.

Use `assign_body_reading` only for the identified scale reading and person, or an explicitly requested discard. `edit_person` covers profile details and goals, with access enforced by the current caller. Access-granting Health Connect registration/upload protocols remain phone operations; do not emulate them through `call_operation`.

Present a `show_widgets` health or nutrition chart when recorded data supports it. Report the actual saved record and amount; a planned meal or target is not an intake entry.

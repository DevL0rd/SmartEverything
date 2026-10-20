---
name: smarteverything-health
description: Read, compare and log health data, meals, water, weight and body readings, and goals for a person; answer how a week or month compares with another.
---

# Health, food and water

## Read

`list_people` gives profile IDs and goals. Keep the requesting profile: an omitted profile has a default and must not redirect a question about a named person. `get_home` gives the time zone. Then `read_health` with the view that fits: summary, daily, latest, records, entries, types or watch_days, bounded to the requested period. To compare periods (this week against last, a month against its average), read the same view and range for each period and compare the same measure; mention missing days or sources. In the summary, energy_in is calories eaten. An absent value is not zero, and readings are not medical conclusions.

## Log

Discover `log_health` and the health type before writing. Use the declared units, give sessions an end time, and keep the user's time and duration. Read existing entries before replacing or removing one.

Meals: `find_food` searches saved foods and Open Food Facts by name or barcode; match product and portion before `log_food` action food. `edit_food` saves a reusable food, not a meal already eaten. `log_food` action water records hydration. Do not invent nutrition numbers: ask for the missing facts, or label an estimate the person requested.

`assign_body_reading` assigns a scale reading to the identified person or discards it when asked. A weigh-in whose scale slot is linked to nobody, or to a different person, stays pending until someone assigns it; never guess by weight. `edit_person` changes profile details (including `scale_user`, the person's number on the Xiaomi scale, owner only) and goals. Health Connect registration and upload are phone operations.

A linked water bottle writes each drink as a Hydration entry labelled Bottle (source `larq`, once per drink, so a deleted drink stays deleted) and refills never count as water. Use `log_food` with action water for other drinks only, never to copy what the bottle already logged, and read bottle figures (levels, fills, streaks, sources) with the `readBottle` operation (`smarteverything-home`). Water totals count every source once.

A treadmill session is saved to the walker as an exercise session of type Treadmill with its speed and step cadence, from the source `smarteverything.treadmill`; the belt's own steps, distance and energy stay on the treadmill pages (the `readTreadmill` operation, see `smarteverything-home`) so they are not added to the daily totals twice. On a Kingsmith G15 the session energy comes from the belt when it reports it (otherwise an estimate that uses the live incline), the heart rate from the belt grips when hands are on them (otherwise the watch), and the climb is the hub's own figure; the elevation gained is written to the session only once the owner confirmed the incline scale (percent or levels), so do not quote a climb as Health data before that. Exercise minutes count time covered by several sources (the belt and a watch) once, and a workout the belt and a watch both recorded is one workout.

Brushing sessions from a Philips Sonicare or Oral-B toothbrush stay on the toothbrush pages (the `readToothbrush` operation, see `smarteverything-home`); they are not written to health records or the daily totals.

Use `show_widgets` for a health or nutrition chart. Report what was actually saved; a plan or target is not an intake entry.

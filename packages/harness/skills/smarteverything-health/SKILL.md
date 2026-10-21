---
name: smarteverything-health
description: "Reads, compares and logs a person's health data, meals, water, weight, body readings and goals: daily totals, sleep, steps, heart rate, workouts, calories eaten, saved foods and scale readings. Use it for “how did I sleep”, “log my breakfast”, “I drank two glasses of water”, “how does this week compare with last week” or “set my step goal”. Not for the treadmill, toothbrush or bottle devices themselves (smarteverything-wellness-devices)."
---

# Health, food and water

## Read

`person_read` gives profile IDs and goals. Keep the requesting profile: an omitted profile has a default and must not redirect a question about a named person. `home_read` gives the time zone. Then `health_read` with the view that fits: summary, daily, latest, records, entries, types or watch_days, bounded to the requested period. To compare periods (this week against last, a month against its average), read the same view and range for each period and compare the same measure; mention missing days or sources. In the summary, energy_in is calories eaten. An absent value is not zero, and readings are not medical conclusions.

## Log

Discover `health_edit` and the health type before writing. Use the declared units, give sessions an end time, and keep the user's time and duration. Read existing entries before replacing or removing one.

Health reads default to today or the recent past when `from` and `to` are left out; `health_edit` action update takes only the fields that change.

Meals: `food_find` searches saved foods and Open Food Facts by name or barcode; match product and portion before `food_log` action food. `food_log` picks the meal from the time of day unless you pass `meal`. `food_edit` saves a reusable food (a name is enough, kind, basis and energy default), not a meal already eaten. `food_log` action water records hydration. Do not invent nutrition numbers: ask for the missing facts, or label an estimate the person requested.

`person_edit` action assign_reading assigns a scale reading to the identified person or discards it when asked. A weigh-in whose scale slot is linked to nobody, or to a different person, stays pending until someone assigns it; never guess by weight. `person_edit` changes profile details (including `scaleUser`, the person's number on the Xiaomi scale, owner only) and goals. Health Connect registration and upload are phone operations.

A linked water bottle writes each drink as a Hydration entry labelled Bottle (source `larq`, once per drink, so a deleted drink stays deleted) and refills never count as water. Use `food_log` with action water for other drinks only, never to copy what the bottle already logged, and read bottle figures (levels, fills, streaks, sources) with the `readBottle` operation (`smarteverything-wellness-devices`). Water totals count every source once.

A treadmill session is saved to the walker as an exercise session of type Treadmill with its speed and step cadence, from the source `smarteverything.treadmill`; the belt's own steps, distance and energy stay on the treadmill pages (the `readTreadmill` operation, see `smarteverything-wellness-devices`) so they are not added to the daily totals twice. On a Kingsmith G15 the session energy comes from the belt when it reports it (otherwise an estimate that uses the live incline), the heart rate from the belt grips when hands are on them (otherwise the watch), and the climb is the hub's own figure; the elevation gained is written to the session only once the owner confirmed the incline scale (percent or levels), so do not quote a climb as Health data before that. Exercise minutes count time covered by several sources (the belt and a watch) once, and a workout the belt and a watch both recorded is one workout.

Brushing sessions from a Philips Sonicare or Oral-B toothbrush stay on the toothbrush pages (the `readToothbrush` operation, see `smarteverything-wellness-devices`); they are not written to health records or the daily totals.

Use `widget_show` for a health or nutrition chart. Report what was actually saved; a plan or target is not an intake entry.

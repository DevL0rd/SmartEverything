---
name: smarteverything-health
description: "Reads, compares and logs a person's health data, meals, water, weight, body readings and goals: daily totals, sleep, steps, heart rate, workouts, calories eaten, saved foods and scale readings. Use it for “how did I sleep”, “log my breakfast”, “I drank two glasses of water”, “how does this week compare with last week” or “set my step goal”. Not for the treadmill, toothbrush or bottle devices themselves (smarteverything-wellness-devices)."
---

# Health, food and water

## Read

`person_read` gives profile IDs and goals. Keep the requesting profile: an omitted profile has a default and must not redirect a question about a named person. `home_read` gives the time zone. Then `health_read` with the view that fits: summary, daily, latest, records, entries, types or watch_days, bounded to the requested period. To compare periods (this week against last, a month against its average), read the same view and range for each period and compare the same measure; mention missing days or sources. In the summary, energy_in is calories eaten. An absent value is not zero, and readings are not medical conclusions.

## Log meals from photos

- Read the attached label first. Use the user's preferred language for the name, translating the product name where needed. Include the brand or barcode only when verified for that exact package. For an unreadable label, log the readable facts and say what is missing, or ask if the food or portion cannot be identified.
- Call `food_log` action food with the known facts inline. Match the basis to the label (per serving or per 100 g), give the amount eaten when known, and include every legible nutrient. Nutrients are in grams, so divide milligrams by 1,000. Unknown is absent, zero is a printed zero, and estimates need the user's request and a clear label. Leave water at zero unless it was explicitly counted toward hydration.
- `food_find` view search is for a verified barcode or when the label lacks facts you need. A missing product does not prevent inline logging. Leave `save` off unless the person asks to save a reusable food. `food_log` picks the meal from local time unless you pass `meal`.
- Confirm using the returned entry. To correct an item or remove a duplicate, use that entry's ID, or read `health_read` view entries once if it is unknown. Then call `food_log` action update with only the changed fields or action remove for the duplicate. Do not log it again. If validation fails, correct the field the error names; repeating the same reads will not fix it.

## Other health entries

Discover `health_edit` and the health type before writing. Use the declared units, give sessions an end time, and keep the user's time and duration. Read existing entries before replacing or removing one.

Health reads default to today or the recent past when `from` and `to` are left out; `health_edit` action update takes only the fields that change.

`food_edit` changes reusable foods. It does not change a meal already eaten. `food_log` action water records a drink; `health_edit` action update can correct its liters.

`person_edit` action assign_reading assigns a scale reading to the identified person or discards it when asked. A weigh-in whose scale slot is linked to nobody, or to a different person, stays pending until someone assigns it; never guess by weight. `person_edit` changes profile details (including `scaleUser`, the person's number on the Xiaomi scale, owner only) and goals. Health Connect registration and upload are phone operations.

A linked water bottle writes each drink as a Hydration entry labelled Bottle (source `larq`, once per drink, so a deleted drink stays deleted) and refills never count as water. Use `food_log` with action water for other drinks only, never to copy what the bottle already logged, and read bottle figures (levels, fills, streaks, sources) with the `readBottle` operation (`smarteverything-wellness-devices`). Water totals count every source once.

A treadmill session is saved to the walker as an exercise session of type Treadmill with its speed and step cadence, from the source `smarteverything.treadmill`; the belt's own steps, distance and energy stay on the treadmill pages (the `readTreadmill` operation, see `smarteverything-wellness-devices`) so they are not added to the daily totals twice. On a Kingsmith G15 the session energy comes from the belt when it reports it (otherwise an estimate that uses the live incline), the heart rate from the belt grips when hands are on them (otherwise the watch), and the climb is the hub's own figure; the elevation gained is written to the session only once the owner confirmed the incline scale (percent or levels), so do not quote a climb as Health data before that. Exercise minutes count time covered by several sources (the belt and a watch) once, and a workout the belt and a watch both recorded is one workout.

Brushing sessions from a Philips Sonicare or Oral-B toothbrush stay on the toothbrush pages (the `readToothbrush` operation, see `smarteverything-wellness-devices`); they are not written to health records or the daily totals.

Use `widget_show` for a health or nutrition chart. Report what was actually saved; a plan or target is not an intake entry.

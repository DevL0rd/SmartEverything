---
name: smarteverything-planner
description: "Reads and changes a person's calendar, tasks, alarms, timers and bedtime: events with guests and RSVP, shared and family calendars, subscribed, holiday and birthday calendars, .ics import and export, booking pages, search, steps and assigned tasks, alarm sounds, challenges and sunrise, bedtime reminders, wind-down and sleep sounds. Use it for “what is on Friday”, “invite Sam to dinner”, “share my calendar with Robin”, “subscribe to this calendar address”, “set an alarm for 6:30 that needs a maths answer”, “set my bedtime to 22:30” or “find the dentist”. Not for one-off hub actions at a later time (schedule_edit) or for automations."
---

# Planner and clock

Resolve the person with `person_read` first; an omitted `personId` means the requester, and only an owner may act for someone else. Read with `planner_read`, change with `planner_edit`, and take every ID from a read. Google is optional: nothing here needs a linked account, and `planner_read` view google_status only says whether one is linked.

## Read

- `day` is what is missed, now, next and done. `range` is events and tasks between two moments with repeats expanded. `free_slots` finds gaps that fit a length. Use the person's time zone from `home_read` for moments.
- `search` finds events and tasks by title, notes, location, guests and calendar name across everything the person may see, and pages with `cursor`. `home_search` has a planner key from the same search.
- `item` gives one task or event with its steps (subtasks) and the person's role. `guests` gives the guest list with each answer and whether the email was delivered.
- `sharing` lists calendars shared by the person, shared with them and the family calendar everyone sees. `feeds` lists subscribed, holiday and birthday calendars and the secret feed addresses published. `booking_pages` lists booking pages with their links.
- `alarms`, `timers`, `bedtime`, `sleep` (nights slept between two moments) and `stats` read the clock side.

## Calendar and tasks

- `planner_edit` actions add, update, move, skip, complete and remove work on tasks and events. Read the item first, change only the named field, and for a repeating item say whether it is this occurrence, the following ones or all.
- Subtasks: `add` a task whose parent field is the parent task's id. Assign a task: `update` with `assignee_id` of a household member who can use the Planner; an event has guests instead.
- `guests_set` replaces the whole guest list of an event with household members (`kind` person) and email contacts (`kind` email). New email guests get an invitation, removed ones are told, so read `guests` and send the full list you mean. `rsvp` answers yes, no or maybe for the person; a member answers with `personId`, an email guest answers on the page in their email.
- `share` gives another household member a calendar as `view` or `edit`; `unshare` takes it back. Only the owner of the calendar may share it.
- `feed_add` subscribes to a calendar address (ics, http, https or webcal), adds a public holidays calendar by country and region (the regions come from `operation_call` readPlannerHolidayRegions) or adds the birthdays calendar. `feed_refresh` fetches a subscription now. A subscribed calendar is read only.
- `import_ics` puts the text of an .ics file into one of the person's own calendars; events with a known UID are updated, and the answer lists what was added, updated and not understood. `export_link` with `link` publish creates the secret feed address of a calendar (publishing again resets it so the old address stops working) and `stop` removes it. Exporting a file is `operation_call` exportPlannerCalendar or exportPlannerItem.
- `booking_page_set` creates a booking page (`page`: calendar, title, minutes, weekly availability windows, buffers, notice, days ahead) or changes one (`pageId` and `pageChanges`, including enabled). `booking_page_remove` deletes it; bookings already made stay on the calendar. A new link for a page is `operation_call` resetPlannerBookingLink.
- `propose` stores drafts the person accepts or rejects; it never adds to the calendar by itself.

## Alarms, timers and bedtime

- `alarm_set` creates an alarm (`alarm`) or changes one (`alarmId` and `alarmChanges`). An alarm can have a tone, a file, a playlist or a radio station as its sound (find stations with `operation_call` searchPlannerRadio), a ramp, a snooze length and limit, a dismiss challenge (maths, QR code or steps), a sunrise with gradual light and a wake automation with its lead time. Read `alarms` first and change only what was asked.
- `timer_start`, `timer_stop` and `stopwatch` run timers. Use them for timers, alarms and reminders for a person.
- `bedtime_set` sends the whole `bedtime` (weekday schedule of bed and wake times, reminder minutes, wind-down minutes and its automation, do not disturb) and optionally `sleepSounds` (sound, timer, fade). Read `bedtime` first and send it back with only the asked change, since it replaces the previous values. `sleep_sound` starts or stops the sleep sound on a phone of the person.

Report what was saved from the answer, not what was planned. An invitation email, a feed address and a booking link are the person's to share; give them only to the person who asked.

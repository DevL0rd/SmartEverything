---
name: smarteverything-cameras
description: "Looks at a home camera now, reviews saved pictures, recordings and events, records a clip, reads what cameras, phones and computers heard, and changes event recording, keep days and listening for the AI’s name. Use for “what’s happening in the garden”, “show me the front door”, “did anyone come by today”, “record the living room for a minute” or “what did the camera hear”. Not for automations that react to cameras (smarteverything-automation-triggers)."
---

# Cameras, events and transcripts

## Choose the evidence

Find cameras with `device_find` family `camera`. `camera_read` view live takes a still now; view saved returns the newest saved picture or a recording snapshot. `event_find` gives dated events and snapshots. Keep capture time and camera identity explicit: an old snapshot says nothing about now, and a still is not continuous observation.

A sound event may carry the detection Baby crying, Unusual sound or Loud sound; a missing detection means generic Sound, not crying or loudness.

`sight_look` inspects a home camera, a computer screen, the front computer window or a paired phone's screen (`phone_screenshot`, which needs the SmartEverything accessibility service on that phone and shows secure windows black); the phone camera needs an active voice call. Use `camera_record` (5-300 seconds) only when asked.

## Transcripts and settings

`transcript_read` has feed, search, range, status and settings views. Use bounded cursor chunks, optionally for one camera; search returns timestamped lines and range loads context around a line. Segment times are server clock, not video time. A camera voice call already starts with the last minutes of that camera’s speech (setting Recent speech in camera calls, default 5, 0 is off) in its context; use feed or range for anything older. Phones and computers that write down speech have their own transcripts (source phone or computer). Plugin conversations (Discord and others) stay in their own tools. `transcript_edit` action delete removes a finished transcript by identity.

`device_edit` action camera sets event recording and `keepDays` (whole days saved clips and pictures are kept, default 15; the hub deletes older ones daily and when the number changes, so a smaller number deletes at once); `listening_read` shows every camera, phone and computer that hears the AI's name, its state and the last wake, and `listening_edit` switches name listening or writing down and sets sensitivity per device, and a phone's power mode (always, screen on, charging, away from home); new phones start with listening off (a member's AI changes only that person's phone or computer). Wake priority: a Discord call first, then walkie channels, then the loudest source. Cameras, walkie channels and Discord are heard by one computer, never by the hub itself: `settings_read` shows it as `ear_host_device_id` under home (null picks the first online computer that can) and `operation_call` updateListeningSettings changes it (owner only); with no such computer online their state reads "needs a computer to listen", so say so and suggest turning one on. The end-of-speech pause (how long a sentence waits for a break before it counts as finished: 0 is Automatic and the default, where Gemini decides when a person is done in calls so the pause adds no delay, and ears use a short fixed pause; or 200, 320, 640, 1000 or 2500 ms) is one home setting shared by calls and every ear (cameras, computers, phones); `settings_read` shows it under home and `operation_call` updateListeningSettings changes it (owner only). `transcript_edit` action settings sets retention and the daily transcription cap. Read current values and the schema first.

Use `widget_show` camera for a live view. `call_show` needs a running call's identity. In a live call the assistant's own looking at a phone or computer screen is one share that keeps streaming until the person or the assistant stops it; which sources it may look at on its own is the `look` list of the `call_audio` preference (`settings_edit` action preference, per paired app), and looking at something the person asked about is always allowed. Watching never means speaking through a camera or starting a conversation.

Which camera events notify the person's phones, how often (a per-camera cooldown, default 2 minutes) and when (quiet hours) is the `camera_notifications` preference (`settings_edit` action preference; see the settings skill). Camera offline and failed snapshot or clip reports are one `offline` notice at most once an hour. When the person is flooded with notifications, lower the kinds, raise the cooldown or set quiet hours instead of muting the whole camera with `device_alerts`.

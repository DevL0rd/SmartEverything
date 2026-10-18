---
name: smarteverything-cameras
description: Look at a home camera now or review saved pictures, recorded events and transcripts; record a clip; change camera recording and listening settings.
---

# Cameras, events and transcripts

## Choose the evidence

Find cameras with `find_devices` family `camera`. `camera_pictures` view live takes a still now; view saved returns the newest saved picture or a recording snapshot. `list_events` gives dated events and snapshots. Keep capture time and camera identity explicit: an old snapshot says nothing about now, and a still is not continuous observation.

A sound event may carry the detection Baby crying, Unusual sound or Loud sound; a missing detection means generic Sound, not crying or loudness.

`see` inspects a home camera, a computer screen, the front computer window or a paired phone's screen (`phone_screenshot`, which needs the SmartEverything accessibility service on that phone and shows secure windows black); the phone camera needs an active voice call. Use `record_camera_clip` (5-300 seconds) only when asked.

## Transcripts and settings

`read_transcripts` has feed, search, range, status and settings views. Use bounded cursor chunks, optionally for one camera; search returns timestamped lines and range loads context around a line. Segment times are server clock, not video time. A camera voice call already starts with the last minutes of that camera’s speech (setting Recent speech in camera calls, default 5, 0 is off) in its context; use feed or range for anything older. Phones and computers that write down speech have their own transcripts (source phone or computer). Plugin conversations (Discord and others) stay in their own tools. `edit_transcripts` action delete removes a finished transcript by identity.

`edit_device` action camera sets event recording; `read_listening` shows every camera, phone and computer that hears the AI's name, its state and the last wake, and `edit_listening` switches name listening or writing down and sets sensitivity per device, and a phone's power mode (always, screen on, charging, away from home); new phones start with listening off (a member's AI changes only that person's phone or computer). Wake priority: a Discord call first, then walkie channels, then the loudest source. Cameras, walkie channels and Discord are heard by one computer, never by the hub itself: `get_settings` shows it as `ear_host_device_id` under home (null picks the first online computer that can) and `call_operation` updateListeningSettings changes it (owner only); with no such computer online their state reads "needs a computer to listen", so say so and suggest turning one on. The end-of-speech pause (how long a sentence waits for a break before it counts as finished: 200, 320, 640, 1000 or 2500 ms) is one home setting shared by calls and every ear (cameras, computers, phones); `get_settings` shows it under home and `call_operation` updateListeningSettings changes it (owner only). `edit_transcripts` action settings sets retention and the daily transcription cap. Read current values and the schema first.

Use `show_widgets` camera for a live view. `call_sight` needs a running call's identity. In a live call the assistant's own looking at a phone or computer screen is one share that keeps streaming until the person or the assistant stops it; which sources it may look at on its own is the `look` list of the `call_audio` preference (`update_settings` action preference, per paired app), and looking at something the person asked about is always allowed. Watching never means speaking through a camera or starting a conversation.

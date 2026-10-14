---
name: smarteverything-cameras
description: Inspect SmartEverything camera pictures, recorded events and transcripts, or change requested recording and listening settings.
---

# Cameras, events and transcripts

## Choose the evidence

Find cameras with `find_devices` family camera. `camera_pictures` view live takes a still now; view saved returns the newest saved picture or a recording snapshot. `list_events` gives dated events and snapshots. Keep the capture time and camera identity explicit: an old snapshot cannot establish what is happening now.

A sound event can identify Baby crying, Unusual sound or Loud sound in its detection details. Keep those distinctions; a missing or unknown detection means generic Sound and does not establish crying or loudness.

`see` can inspect a home camera, a computer screen or the front computer window. Phone camera and screen sight need an active SmartEverything voice call; the chat tool cannot provide them. A still image does not establish continuous live observation. Use `record_camera_clip` only when recording was requested; its supported duration is 5–300 seconds.

## Read or change listening

`read_transcripts` offers list, session, search, status and settings views. These owner-only records include camera listening and plugin conversations; query a bounded period or specific session rather than dumping all private speech. `delete_transcripts` removes a finished transcript and its lines, while an active conversation stays. Deletion requires the requested transcript identity.

Use `update_device` what camera for event recording, wake sensitivity or transcription. Use `update_transcript_settings` for retention and the daily transcription cap. Read the current values and the exact schema first; changing listening is distinct from reading an existing recording.

## Present and stop

Use `show_widgets` camera for a live view when useful. To show a home camera inside a running voice call, `call_sight` requires that call's identity; stopping sight need not end the call. Respect the initiating person's camera and computer grants, native approvals and any explicit private-camera restrictions. Observation does not authorize speaking through a camera or starting a conversation. Live WebRTC and microphone protocols remain with the person in the app.

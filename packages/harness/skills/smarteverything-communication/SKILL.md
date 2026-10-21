---
name: smarteverything-communication
description: "Notifies, speaks to, calls or voice-chats with a person, checks where someone can be reached, manages walkie-talkie channels and members, and uses Discord when its plugin is on. Use it for “tell Mom dinner is ready”, “announce on the kitchen speaker”, “call my phone”, “is Sam reachable” or “add the AI to the family channel”. Not for messages into a chat with files (chat_post in smarteverything-chats) or automations that notify (smarteverything-automations)."
---

# Presence and communication

Resolve the person with `person_read` and read `presence_read` before `person_notify`, `voice_speak`, `call_start` action open or `call_start` action ring. Presence says where someone can be reached, not that you may interrupt. Use the channel and message the user asked for; a reachable speaker does not justify an unrequested broadcast.

- `person_notify` posts to the person's newest chat and sends a phone notification.
- `voice_speak` plays speech on a device or walkie-talkie channel. It returns when playback has started, not when it ends; if the speaker cannot play (for a camera: its stream is down, probably the firewall or the camera being offline) it fails with the reason, so tell the person and offer another speaker. A failure after it started arrives as an outreach note in the chat.
- `call_start` action open opens live voice through a device or channel.
- `call_start` action ring rings a person's phone or desktop app.

Check `outreach_read` for existing calls and conversations first. Keep the outreach ID for `call_end` and end only the requested call. `call_show` changes sight inside a running call.

To react to a call, a ring that nobody answered or the AI's name being heard, build an automation on the `call` and `listening` signals (see the automations skill); they never include what was said.

`talk_read` lists channel members, speakers and transcripts; `talk_edit` manages a channel, its members and AI listening. Read membership before changing it.

Plugin channels such as Discord have their own tools: find them with `plugin_read`, `tool_search` and `tool_read`, and do only what the user asked. `plugin_read` view people lists who may act through a plugin and the person of the home each one acts as: a Discord person linked to a home person acts with that person's role and chats, an unlinked one is a limited guest in the owner's chat. Approving or linking one is the owner's step in Settings, so tell them where instead of looking for another route.

The overlay on the desktop and phone is the person's view of a call (captions, mute, share, end); you have no overlay control, only `call_end` and `call_show`.

In a live voice session use the exposed `conversation_end` or `sight_stop`; a text chat has no voice-only tools.

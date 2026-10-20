---
name: smarteverything-communication
description: Notify, speak to, call or voice-chat with a person, check who is reachable, manage walkie-talkie channels, and use Discord when the plugin is enabled.
---

# Presence and communication

Resolve the person with `list_people` and read `read_presence` before `notify_person`, `speak`, `start_conversation` or `call_person`. Presence says where someone can be reached, not that you may interrupt. Use the channel and message the user asked for; a reachable speaker does not justify an unrequested broadcast.

- `notify_person` posts to the person's newest chat and sends a phone notification.
- `speak` plays speech on a device or walkie-talkie channel. It returns when playback has started, not when it ends; if the speaker cannot play (for a camera: its stream is down, probably the firewall or the camera being offline) it fails with the reason, so tell the person and offer another speaker. A failure after it started arrives as an outreach note in the chat.
- `start_conversation` opens live voice through a device or channel.
- `call_person` rings a person's phone or desktop app.

Check `read_ai_activity` for existing calls and conversations first. Keep the outreach ID for `hang_up` and end only the requested call. `call_sight` changes sight inside a running call.

To react to a call, a ring that nobody answered or the AI's name being heard, build an automation on the `call` and `listening` signals (see the automations skill); they never include what was said.

`read_talk` lists channel members, speakers and transcripts; `edit_talk_channel` manages a channel, its members and AI listening. Read membership before changing it.

Plugin channels such as Discord have their own tools: find them with `read_plugins`, `search_tools` and `tool_details`, and do only what the user asked. `read_plugins` view people lists who may act through a plugin and the person of the home each one acts as: a Discord person linked to a home person acts with that person's role and chats, an unlinked one is a limited guest in the owner's chat. Approving or linking one is the owner's step in Settings, so tell them where instead of looking for another route.

The overlay on the desktop and phone is the person's view of a call (captions, mute, share, end); you have no overlay control, only `hang_up` and `call_sight`.

In a live voice session use the exposed `end_conversation` or `stop_looking`; a text chat has no voice-only tools.

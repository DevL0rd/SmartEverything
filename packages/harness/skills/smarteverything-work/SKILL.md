---
name: smarteverything-work
description: Find, read, create, branch or message chats; hand work to a helper; switch the machine a chat runs on; read and control a computer (sound, screens, system, apps, windows, processes, files); start or answer an owned Claude CLI session.
---

# Chats and computers

## Chats and helpers

`read_chats` finds the caller's chats, messages and attached files; a member's AI reaches only that person's own chats and their files, and only the owner's AI reads other people's chats or camera transcripts. `search_chat_references` finds files, folders, skills, plugins and earlier chats to refer to without opening them; a Claude chat finds only the files and folders of its working directory, which Claude reads by name. `edit_chat` creates, branches (optionally onto another engine) or changes a chat; read it first so tools, engine, model and archive state survive. A retry replaces a reply and is not a read.

The timeline clips large tool results and says how long they are: page through the full text with `read_tool_result` (`chatId`, `callId`, `offset`, `limit`). Use `chat_send` or `assistant_post` only when the person asks to send or post there.

`subagent_run` starts a helper with a self-contained prompt, the needed tools and the same engine and model unless another is requested. It inherits your authority and cannot widen it. Its result arrives as a report: do not re-read chats to check completion.

## Machines

`list_machines` shows each machine's name, system, whether it is online and which one this chat is on. `switch_machine` moves this chat by name or id; the next tool call runs on the new machine. Switch when the task needs files or programs that live elsewhere. To read one file elsewhere without moving, use `read_files` with that computer's `deviceId`; to post a file from a computer to Discord, pass `files: [{ machine, path }]` to the Discord send tool. A question you were waiting on when the chat moved is asked again on the new machine and its answer arrives as a message, so do not ask twice.

`find_devices` (family computer) gives the `deviceId` every computer tool takes. A member's AI reaches only that person's own computers; the owner's reaches all. Read before you change, because ids and names come from the reads, never from memory.

Windows and macOS computers are new and their support is not verified yet: they offer readings, programs (`list_processes`, `end_process`), installed apps, file browsing and reading, power, lock, ring, opening links and files, and screenshots (ring and screenshots need the SmartEverything app running, and so does opening links on Windows). Sound, screens, windows, system settings, services and changing files answer that they are not available there; `get_computer` `permissions` and the device's capabilities show what each machine offers.

- Read with `get_computer` `view`: `now` (load, battery, temperatures), `audio`, `displays` (`modes: true` lists every resolution), `system` (power mode, Do Not Disturb, layout, Wi-Fi, Bluetooth), `usb`, `windows`, `services`, `startup`, `history`, `permissions`. `computer_apps` lists installed apps; `list_processes` gives pids, sorted by any column, with `search` and `tree`, or one program in detail with `pid`. Lists page with `next` as `cursor`.
- Sound: `set_computer_audio` actions `volume`, `mute` (use `kind: input` for the microphone), `default`, `app_volume`, `app_mute`, `app_output`. Name outputs, inputs and apps as the `audio` view shows them.
- Screens: `set_computer_display` actions `enable`, `disable`, `mode`, `scale`, `rotation`, `primary`, `position`, `mirror`, `brightness`, `hdr`, `vrr`, `night_light`. A change that can blank a screen reverts by itself after 15 seconds, and the answer says when. Call action `keep` only after the person confirms the screen looks right, and never keep a change that turned every screen off unless they asked for exactly that; `revert` undoes it at once. Automations use the `audio` and `display` steps, not this tool (load `smarteverything-automations`).
- System: `set_computer_system` actions `power_mode`, `dnd`, `keyboard_layout`, `wifi` (turning it off can cut the computer off from SmartEverything), `wifi_connect` (saved networks), `bluetooth`, `bluetooth_device`, `startup_app`, `service` (the signed-in person's own services; on the hub computer, stopping or restarting the hub's own service or ending its process is refused, the person does that from the hub's page). Power actions (shut down, restart, sleep, lock) stay with `control_devices`, which the person's AI-power switch can disallow.
- Apps and programs: `run_computer_app` opens or closes an app, or acts on a window (`window_focus`, `window_minimise`, `window_close`, `windowId` from the `windows` view). `end_process` ends, force quits (can lose work), pauses, resumes or sets `priority` with `nice`.
- Files: `read_files` browses folders anywhere on the computer, not only the home folder, reads files up to 5 MB, searches names (`view: search`) and shows size, owner and dates (`view: properties`). `view: download` with `paths` prepares a download of any size: one file as it is, a folder or several items as one zip, with a short-lived signed `url` for the person to open and anything that could not be included; tell the person where to tap, or point them to Files. `edit_computer_files` makes folders, renames, moves, copies, trashes and restores (never deletes for good, never overwrites unless `replace: true`), and saves a chat attachment with `upload`.

The owner's chats can use native file and shell tools on the hub's machine without selecting a computer. That shell can do anything the owner could do there, including stopping the hub; only the typed computer tools refuse, and nothing inspects shell commands. Never use the shell to stop, restart or kill the hub's own service or process: the person does that from the hub's page. For code and previews load `smarteverything-coding-process`; for webpages and browser tools load `smarteverything-browser`.

A message sent while you work reaches you as `User message received while you were working: "..."`. Acknowledge it in a sentence, keep going, and stop or change course only if it says to.

## Owned Claude CLI sessions

Keep the chat's own engine for ordinary work, programming included. Use a native Claude session only when the person asks to start, inspect, continue or answer one. `read_claude` views cli_sessions and cli_prompts on the selected computer come first. Then `edit_claude_session` action start creates one shared chat and queues its first turn with an explicit model and working directory, action control or answer acts on an existing one. Action start with `continue_from.session_id` (an earlier Claude Desktop or terminal session from the `read_claude` sessions view) continues a copy of it in the new chat and leaves the original untouched; a send while a session's reply is running steers that running reply instead of waiting. Keep the operation ID and reconcile an unknown delivery through its receipt without repeating the prompt. Answer only the exact pending request with its complete question data. Missing provider readiness is a limitation: do not borrow credentials or switch to paid API access.

Native tool grants are per computer: `readComputerNativeMcpPolicy` (through `list_operations`) shows them; only the person changes them in settings.

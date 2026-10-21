---
name: smarteverything-chats
description: "Finds, reads, starts, branches, archives or deletes AI chats, messages another chat, starts a helper on a task, posts results into a chat, reads a clipped tool result, moves a chat to another machine, and runs Claude CLI sessions. Use for “ask my other chat”, “start a helper to research this” or “move this chat to my desktop”. Not for controlling a computer (smarteverything-computers) or writing code (smarteverything-coding-process)."
---

# Chats, helpers and machines

Managing a chat (`chat_edit`) and giving work to one (`chat_send`, `subagent_run`) are different jobs: a helper's answer comes back to you as a report, so do not poll chats to see whether it finished. Send or post into another chat only when the person asked.

## Chats and helpers

`chat_read` finds the caller's chats, messages and attached files; a member's AI reaches only that person's own chats and their files, and only the owner's AI reads other people's chats or camera transcripts. `reference_search` finds files, folders, skills, plugins and earlier chats to refer to without opening them; a Claude chat finds only the files and folders of its working directory, which Claude reads by name. `chat_edit` creates, branches (optionally onto another engine) or changes a chat; read it first so tools, engine, model and archive state survive. A retry replaces a reply and is not a read.

The timeline clips large tool results and says how long they are: page through the full text with `tool_result_read`. Use `chat_send` or `chat_post` only when the person asks to send or post there.

`subagent_run` starts a helper with a self-contained prompt, the needed tools and the same engine and model unless another is requested. It inherits your authority and cannot widen it. Its result arrives as a report: do not re-read chats to check completion.

## Machines

`machine_read` shows each machine's name, system, whether it is online and which one this chat is on, and `sandbox: partial` where file reads are not confined. A Windows machine runs PowerShell (`pwsh`) as its shell, confines writes but not reads, and cannot supply subscription accounts. `machine_switch` moves this chat by name or id; the next tool call runs on the new machine. Switch when the task needs files or programs that live elsewhere. To read one file elsewhere without moving, use `file_read` with that computer's `deviceId`; to post a file from a computer to Discord, pass `files: [{ machine, path }]` to the Discord send tool. A question you were waiting on when the chat moved is asked again on the new machine and its answer arrives as a message, so do not ask twice.

## Owned Claude CLI sessions

Keep the chat's own engine for ordinary work, programming included. Use a native Claude session only when the person asks to start, inspect, continue or answer one. `claude_read` views models, cli_sessions and cli_prompts on the selected computer come first. Then `claude_control` action start creates one shared chat in a `cwd` with a first `message` (the model is the computer's first available one unless `model` is given), action send messages it (a send while its reply runs steers that reply, and a send to a stopped chat resumes it), stop, close, configure (model or permissionMode) and answer act on an existing `chatId`. Action start with `continueFrom` (an earlier Claude Desktop or terminal session id from the `claude_read` sessions view) continues a copy of it in the new chat and leaves the original untouched. The answer carries the receipt state; reconcile an unknown delivery with `claude_read` view cli_operation instead of repeating the message. Answer only the pending prompt, with the `answer` its kind needs. Missing provider readiness is a limitation: do not borrow credentials or switch to paid API access.

Native tool grants are per computer: `readComputerNativeMcpPolicy` (an operation for `operation_call`) shows them; only the person changes them in settings.

## Messages while you work

A message sent while you work reaches you as `User message received while you were working: "..."`. Acknowledge it in a sentence, keep going, and stop or change course only if it says to.

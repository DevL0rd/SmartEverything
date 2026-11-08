---
name: smarteverything-chats
description: 'Finds, reads, starts, branches, archives or deletes AI chats, messages another chat, starts a helper on a task, posts results into a chat, reads a clipped tool result, moves a chat to another machine, and runs Claude CLI sessions. Use for “ask my other chat”, “start a helper to research this” or “move this chat to my desktop”. Not for controlling a computer (smarteverything-computers) or writing code (smarteverything-coding-process).'
---

# Chats, helpers and machines

Use `chat_edit` to manage a chat and `chat_send` or `subagent_run` to give work to one. Unwaited answers return automatically, so there is no need to poll chats for completion. Send or post into another chat only when the person asked.

## Chats and helpers

`chat_read` finds the caller's chats, messages and attached files; a member's AI reaches only that person's own chats and their files, and only the owner's AI reads other people's chats or camera transcripts. `reference_search` finds files, folders, skills, plugins and earlier chats to refer to without opening them; a Claude chat finds only the files and folders of its working directory, which Claude reads by name. `chat_edit` creates, branches (optionally onto another engine) or changes a chat; read it first so tools, engine, model and archive state survive. A retry replaces a reply and is not a read.

When available, `chat_edit` action `react` adds or removes your own emoji reaction to a saved message in this chat. Use the message ID from `chat_read` and one complete Unicode emoji. If a message reached you as a helper from the parent conversation, set `in_parent: true` with the delivered input’s ID from your own chat to react to its copy in the parent. This works during delivery of that input. A reaction does not start a turn or replace an answer the person needs.

The timeline clips large tool results and says how long they are: page through the full text with `tool_result_read`. Use `chat_send` or `chat_post` only when the person asks to send or post there.

`chat_read` view `meters` reads the last hour of recorded context and cache changes in one chat and any reported usage from its current weekly subscription allowance. Use the chatId of the chat the person asked about.

New chats are titled automatically from the first request. If the person asks you to rename the current chat, use `chat_edit` with action `update` and the new `title`. Leave `chatId` out to target this chat. Keep the title short and specific to the topic.

`subagent_run` starts a helper with a self-contained prompt, the needed tools and the same engine and model unless another is requested. It inherits your authority and cannot widen it. The tool creates the helper chat and returns its `chatId`. Use that `chatId` with `chat_send` for follow-ups. Explicit messages between a parent and its direct helper appear in the parent thread. The helper’s messages and unwaited answers appear under its name.

A chat that offers `subagent` instead of `subagent_run` starts its helpers with `subagent` (a short `description` and a self-contained `prompt`) and reaches them with `send_message`, `interrupt_agent` and `list_agents`; their answers also arrive as reports. When `subagent` also takes `provider`, `model` and `reasoning_effort`, leave them out so the helper runs on the same model and effort as this chat; do not specify a model unless other instructions or the person ask for one. `provider` is the route id your system prompt names (the id before the dash in `list_subagent_models`), never a company name such as OpenRouter, and goes together with `model`. A route the person may not use, or any choice after the owner turned model choice off, is refused.

## Quotes and mentions

To reply to one earlier message, pass its ID from `chat_read` as `quoteMessageId` on `chat_send`, `chat_post` or `chat_speak`. The message must be in the chat you write to. The chat shows it as a quote strip with the sender and the first words of the original, the same as when the person quotes you. Quote only when the reply is to that message; leave it out for an ordinary answer. Write `@Name` with a helper's or person's name to mention them: it shows as a chip, and a helper name in a message to that helper only makes the direction clear.

## Voice replies

When the person asks you to answer by voice or with a voice message, in the main chat or a helper chat, use `chat_speak` with the exact words to speak. It uses the same text-to-speech model and voice as `voice_speak`, from the voice settings, and posts a playable clip with its transcript in the current chat. The clip is the answer: do not repeat its words in text, and keep any written follow-up brief. If the outcome is uncertain, check the chat before starting another voice reply.

## Share helper files privately

When the person asks to see a helper’s files in the parent conversation, use `chat_post` with `shareWithParent` from the helper if the tool is granted. Read the live schema. Choose attachments already saved in your own chat or a completed image operation from your chat. The hub chooses the direct parent and posts under your helper name. The receipt identifies the parent message and its attachment copies. Use the same request ID and payload after an uncertain response. Keep routine output in your own chat.

## Goals, loops and notes

`create_goal` sets a goal for this chat that you keep working towards across turns; `get_goal` reads it and `update_goal` changes it or marks it done. `ralph` repeats a task in fresh rounds that hand a short note to each other, for work too long for one pass. `memory` keeps one-fact notes that outlive the chat: scope person is private to the person you are talking with, scope home is shared and only an owner changes it. Never store secrets or passing task state there.

## Machines

`machine_read` shows each machine's name, system, whether it is online and which one this chat is on, and `sandbox: partial` where file reads are not confined. A Windows machine runs PowerShell (`pwsh`) as its shell, confines writes but not reads, and cannot supply subscription accounts. `machine_switch` moves this chat by name or id; the next tool call runs on the new machine. Switch when the task needs files or programs that live elsewhere. To read one file elsewhere without moving, use `file_read` with that computer's `deviceId`; to post a file from a computer to Discord, pass `files: [{ machine, path }]` to the Discord send tool. A question you were waiting on when the chat moved is asked again on the new machine and its answer arrives as a message, so do not ask twice.

## Helper engines

Keep this chat's own engine for ordinary work. When the person requests a Claude or Codex harness for a helper, use `subagent_run` with that engine and the supplying computer. Account-backed models use their chosen route in ordinary SmartEverything chats. If a subscription route is unavailable, report it before choosing another route.

To see exactly what an AI chat did (its turns, tool calls, retries and goal rounds), `listDshSessions` lists the person's AI sessions and `readDshSessionEvents` (operations for `operation_call`) reads one session's original events in order, a page at a time: `offset` is the event seq to start at, `limit` the page size, and `next_offset` reads the next page.

Native tool grants are per computer: `readComputerNativeMcpPolicy` (an operation for `operation_call`) shows them; only the person changes them in settings.

## Messages while you work

In the SmartEverything harness and in Claude, a delivered steer message is marked `User message received while you were working: "..."`. In Codex, a new message waits for the current turn to finish. Acknowledge a delivered steer in a sentence, then continue the task you are on. Stop or change course when the person explicitly says to stop this work, redirects you, or another rule requires it.

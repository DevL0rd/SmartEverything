---
name: smarteverything-work
description: Manage SmartEverything chats and scoped helper tasks, inspect authorized computers and apps, and manage explicitly requested owned native Claude sessions. Use the coding skill for projects and previews, and the browser skill for webpages and browser tools.
---

# Chats and computers

## Preserve conversation ownership

Use `read_chats` to find the caller's chats, messages or attached files. `edit_chat` creates, branches or changes the requested chat; inspect it first so tools, engine, model and archive state survive unrelated edits. A retry replaces a reply and is not a read. Use `chat_send` or `assistant_post` only when the person asks to send or post to that destination.

`subagent_run` starts a helper with an engine, model and tools chosen within the task. Preserve the selected harness and model unless the person requests a different helper route. Keep its prompt self-contained, scoped to the authorized task and limited to necessary tools. Delegation inherits initiating authority; it cannot grant another profile, widen computer access or bypass a native approval. Use returned task delivery rather than repeatedly reading chats for completion.

## Inspect a computer

`find_devices` identifies computers. `get_computer` exposes the computer service's own permission grants, while now and history views diagnose load. `computer_apps` identifies installed apps, then `run_computer_app` opens or closes the chosen app. `list_processes` gives exact process IDs before `end_process`; force quitting can lose work. `read_files` is confined to the signed-in person's home on the selected computer.

Computer actions require the selected computer's actual capabilities and grants. Ordinary native file and shell tools execute on the chat's selected machine under its native permission; selecting a project is not a prerequisite grant. Use `set_working_directory` to choose the primary folder for relative paths and indexing without changing the selected machine, permission or central artifact storage. Central chat files use the explicit project-file tools. Native Hub access requires its authenticated owner; being an owner does not grant another profile or machine access. Chat management and delegation do not require a computer. For code, project files and development previews, load `smarteverything-coding-process`; for webpage reads, website testing or embedded Browser control, load `smarteverything-browser`.

## Manage a requested native session

Keep the chat's selected harness and model for ordinary work, including programming. Use the native Claude lifecycle below only when the person requests starting, inspecting, continuing or answering an owned Claude session; never treat a coding request as an instruction to switch engines or delegate to Claude.

Native Claude sessions without an explicit device project use central project tools only when their runtime advertises managed-project protocol 1: native filesystem, shell, agents and external tool sources are disabled, while the same Claude harness and session history remain. Discover the project and preview tools through the home bridge. Native cwd is runtime state, never a mirror of central files. Explicit device projects and legacy sessions retain their native directories. The current Codex adapter has no complete central-only tool boundary; select an explicit device project when that capability is unavailable, and report the limitation. Native commands and local execution require that explicit project.

For owned Claude CLI work, use `read_claude_cli` on the selected computer before `claude_session` or `claude_answer`. `claude_start` creates one owned shared chat and queues its actual first native turn with explicit model and working directory; the native provider must already be enabled. The authenticated current owner profile is fixed. Retain the operation ID and reconcile unknown delivery through its receipt without repeating the prompt. Read saved history without starting a process. Answer only the exact pending owned request with its current session/job and complete question, custom/multiple-answer or elicitation data. Starting, sending or answering needs the user's task and native permission scope. `read_claude` remains legacy history; legacy IDs do not grant control or adoption. Arbitrary existing-terminal attachment and direct SDK tool invocation are not supplied by this lifecycle. Missing provider readiness is a limitation, not a reason to repurpose credentials or switch to paid API access.

Outbound home-tool grants are independent per computer and native runtime. Discover `readComputerNativeMcpPolicy` through `list_operations` to inspect the current enablement and areas; only the person grants access in settings. `null` follows globally allowed home tools and an empty area list denies all. Legacy access changes never authorize wider MCP areas or provider execution. Ordinary website personal/OAuth connections remain separate.

Legacy Desktop control and controller registration are retired. The optional attached Claude Code link still supports its own exact tool listing/calls and approval bridge; use the discovered native schema instead of assuming a Desktop action mapping. Legacy transcript, archive and sampled usage reads do not start a process or adopt ownership.

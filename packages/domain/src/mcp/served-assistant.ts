import { SHOW_IN_APP_TEXT } from '../app-view';
import type { Served } from './served-types';

export const SERVED_ASSISTANT = [
  {
    name: 'chat_read',
    area: 'assistant',
    access: 'read',
    title: 'Read chats',
    line: 'Chats, search, messages, files and meters',
    description:
      'The caller’s AI chats, a search through titles and messages, one chat’s messages or meter history, their default chat, or one attached file. Returns the chatId other chat tools take.',
    route: {
      key: 'view',
      branches: {
        list: { part: 'chats_list', line: 'Chats, newest first, with filters' },
        search: { part: 'chats_search', line: 'Chats whose title or messages match words' },
        messages: { part: 'chat_read', line: 'The messages of one chat' },
        meters: {
          part: 'chat_meter_history',
          line: 'One chat’s recent context and cache and observed weekly subscription usage',
        },
        history: { part: 'assistant_history', line: 'The person’s default chat' },
        attachment: {
          part: 'read_assistant_attachment',
          line: 'One attached file: image, text, or the transcript of audio or video',
        },
      },
    },
  },
  {
    name: 'chat_edit',
    area: 'assistant',
    access: 'control',
    title: 'Edit chats',
    line: 'Start, rename, pin, archive, branch, stop or delete',
    description:
      'Manages chats: starts a new one, changes one (title, icon, pin, archive, read, engine, model, tools), branches it, regenerates a reply, stops its run, deletes it or one message, or adds or removes the assistant’s emoji reaction in its current chat or on a delivered helper input’s parent copy. Not for sending a chat work (chat_send) or starting a helper on a task (subagent_run).',
    route: {
      key: 'action',
      branches: {
        create: { part: 'chat_create', line: 'Start a new chat with an optional engine and tools' },
        update: {
          part: 'chat_update',
          line: 'Title, icon, pinned, archived, read, engine or tools',
        },
        branch: { part: 'chat_branch', line: 'Copy a chat up to one message into a new chat' },
        react: {
          part: 'chat_react',
          line: 'React in this chat or to the parent copy of a delivered helper input',
        },
        retry: { part: 'chat_retry', line: 'Regenerate the reply to one message' },
        stop: { part: 'chat_stop', line: 'Stop the chat’s running reply' },
        delete: { part: 'chat_delete', line: 'Delete a chat' },
        delete_message: { part: 'chat_message_delete', line: 'Delete one message' },
      },
    },
  },
  {
    name: 'chat_send',
    area: 'assistant',
    access: 'control',
    title: 'Message another chat',
    line: 'Its AI answers back by itself',
    description:
      'Messages another of the person’s chats (chatId from chat_read). Messages between a parent and its direct helper appear in the parent thread. Wait for the answer or receive it as a report later. Set quoteMessageId to a message in that chat (from chat_read) to reply to it as a quote, and write @Name to mention a helper or person.',
    route: { part: 'chat_send' },
  },
  {
    name: 'subagent_run',
    area: 'assistant',
    access: 'control',
    title: 'Run a subagent',
    line: 'A helper chat works on a task',
    description:
      'Starts a helper chat on one task and returns its answer or a later report. In a SmartEverything conversation, use the local agent tools for ordinary helpers and this tool only for an explicitly selected Claude or Codex harness and computer. The helper sees only the task text. Use its returned chatId with chat_send for follow-up.',
    route: { part: 'subagent_run' },
  },
  {
    name: 'chat_post',
    area: 'assistant',
    access: 'control',
    title: 'Post to a chat',
    line: 'A message with files in their chat or a helper’s parent',
    description:
      'Posts a message with optional files into a person’s AI chat; set quoteMessageId to a message in that chat (from chat_read) to reply to it as a quote, and write @Name to mention a helper or person. In an admitted helper, shareWithParent posts selected saved attachments or the results of a completed image operation privately into its direct parent without starting a turn.',
    route: { part: 'chat_post' },
  },
  {
    name: 'widget_show',
    area: 'assistant',
    access: 'control',
    title: 'Show widgets',
    line: 'Cards and charts under a reply',
    description:
      'Attaches live widgets (a device, remote or camera card, a health or nutrition chart, a plugin board, weather, scenes, or a button that opens a setting, device, automation, scene, room, schedule or page) under the reply you are writing, when seeing the thing helps. Ids come from reads; a reply holds at most 6, extra ones come back in dropped.',
    route: { part: 'widget_show' },
  },
  {
    name: 'app_show',
    area: 'assistant',
    access: 'control',
    title: 'Show in the app',
    line: 'Open a page, point at one thing or clear the pointer',
    description: SHOW_IN_APP_TEXT,
    route: {
      key: 'action',
      branches: {
        open: { part: 'show_in_app', line: 'Open a page in the person’s app' },
        highlight: {
          part: 'point_in_app',
          line: 'Point at one thing on the screen it is on now',
        },
        dismiss: {
          part: 'clear_app_pointer',
          line: 'Clear the pointer',
        },
      },
    },
  },
  {
    name: 'self_update',
    area: 'system',
    access: 'control',
    title: 'Update SmartEverything itself',
    line: 'Update the hub, Android app and desktop UI, or share a file',
    description:
      'For the owner’s own chat or its trusted automatic repair chat. Check status before updating the hub. Hub returns a run ID and posts its verified result later; recover resumes an interrupted hub update. When enabled, app offers a signed Android installer for native changes; ui publishes compatible Android and desktop UI offers. Desktop native changes require the canonical machine release workflow. Test requires a paired Android device. Release offers target compatible devices on that channel. Check status with the publication run ID after interruption; partial means a platform is missing and can be resumed with that same request. Historical Android-only UI publications remain partial without replay. Published means offered, never installed. File attaches privately in this chat by default.',
    route: {
      key: 'action',
      branches: {
        status: {
          part: 'self_update_status',
          line: 'Read a hub or app publication outcome by run ID',
        },
        hub: { part: 'self_update_hub', line: 'Prepare a hub release with automatic recovery' },
        app: { part: 'self_update_app', line: 'Offer a signed Android installer when enabled' },
        ui: {
          part: 'self_update_ui',
          line: 'Offer compatible Android and desktop UI updates when enabled',
        },
        recover: { part: 'recover_hub_update', line: 'Resume an interrupted hub update' },
        file: { part: 'send_chat_file', line: 'Send a file as an attachment in this chat' },
        claim: {
          part: 'claim_repair_work',
          line: 'Route repair alerts for a component to this chat',
        },
      },
    },
  },
  {
    name: 'model_read',
    area: 'assistant',
    access: 'read',
    title: 'Read AI models',
    line: 'Chat and image models with prices',
    description:
      'AI models SmartEverything can use with their prices and thinking levels, one model in full, or the image models with prices and the one the person selected (read it before image_gen).',
    route: {
      key: 'view',
      branches: {
        list: { part: 'list_models', line: 'Models filtered by kind, words or provider' },
        model: { part: 'get_model', line: 'One model with its prices and limits' },
        images: {
          part: 'list_image_endpoints',
          line: 'Image models with prices and selected, the person’s pick',
        },
      },
    },
  },
  {
    name: 'usage_read',
    area: 'assistant',
    access: 'read',
    title: 'Read AI costs',
    line: 'Totals, over time, one by one',
    description:
      'What the AI cost: totals, a series over time, or every cost one by one, filtered by people, devices, models, chats or plugins.',
    route: {
      key: 'view',
      branches: {
        totals: { part: 'usage_totals', line: 'Totals, optionally split by a dimension' },
        series: { part: 'usage_series', line: 'Costs per bucket over a range' },
        ledger: { part: 'usage_ledger', line: 'Every cost one by one, paged' },
      },
    },
  },
  {
    name: 'presence_read',
    area: 'assistant',
    access: 'read',
    title: 'Where is someone',
    line: 'Their apps, phone, last seen in the home',
    description:
      'Where a person can be reached now: their open apps, phone and the home device they were last near. Read it before voice_speak, call_start or person_notify.',
    route: { part: 'presence_read' },
  },
  {
    name: 'outreach_read',
    area: 'assistant',
    access: 'read',
    title: 'Read AI outreach',
    line: 'Conversations, calls and wakes',
    description:
      'Conversations the AI started, voice calls running now with their outreachId for call_end, or the times automations woke the AI.',
    route: {
      key: 'view',
      branches: {
        conversations: { part: 'list_conversations', line: 'Conversations the AI started' },
        calls: { part: 'list_calls', line: 'Voice calls running now' },
        wakes: { part: 'list_wakes', line: 'Times automations woke the AI' },
      },
    },
  },
  {
    name: 'person_notify',
    area: 'assistant',
    access: 'control',
    title: 'Notify someone',
    line: 'A note in their chat, with a notification',
    description:
      'Sends a person (personId from person_read) a short message in their newest chat with a phone notification, urgent when it must break through. Not for saying it out loud (voice_speak).',
    route: { part: 'person_notify' },
  },
  {
    name: 'chat_speak',
    area: 'assistant',
    access: 'control',
    title: 'Send a voice reply',
    line: 'A playable voice message in this chat',
    description:
      'Answers in the current AI chat with a voice message when the person asks for a voice reply: speaks the supplied text with the configured speech model and voice and posts it as a playable clip with its transcript; set quoteMessageId to reply to a message in this chat as a quote. Works in helper chats too. It does not play on devices or start a call.',
    route: { part: 'chat_speak' },
  },
  {
    name: 'voice_speak',
    area: 'assistant',
    access: 'control',
    title: 'Say something',
    line: 'Out loud on a device or walkie channel',
    description:
      'Says something out loud once on a device that can speak or a walkie-talkie channel; presence_read and device_find tell where the person is. Not for a live back-and-forth (call_start).',
    route: { part: 'speak' },
  },
  {
    name: 'call_start',
    area: 'assistant',
    access: 'control',
    title: 'Start a voice call',
    line: 'Ring a person or talk through a device',
    description:
      'Starts a live voice conversation: ring rings a person’s phone or desktop app (personId from person_read), open talks through a home device or walkie channel. Read presence_read first. Returns the outreachId for call_end.',
    route: {
      key: 'action',
      branches: {
        ring: { part: 'call', line: 'Ring a person’s phone or desktop app' },
        open: { part: 'start_conversation', line: 'Talk live through a device or walkie channel' },
      },
    },
  },
  {
    name: 'call_end',
    area: 'assistant',
    access: 'control',
    title: 'Hang up',
    line: 'Stop ringing or end a conversation',
    description:
      'Ends a call or conversation the AI started; outreachId comes from call_start or outreach_read view calls.',
    route: { part: 'call_end' },
  },
  {
    name: 'call_show',
    area: 'assistant',
    access: 'control',
    title: 'Show a camera in a call',
    line: 'A home camera, or stop looking',
    description:
      'Shows a home camera to the assistant in a running voice call, or stops it looking at anything; callId comes from outreach_read view calls.',
    route: {
      key: 'action',
      branches: {
        show_camera: { part: 'show_camera_in_call', line: 'Show one home camera in the call' },
        stop: { part: 'stop_sight_in_call', line: 'Stop looking at anything' },
      },
    },
  },
  {
    name: 'inbox_post',
    area: 'assistant',
    access: 'control',
    title: 'Hand over a message',
    line: 'For plugins to hand over a chat message',
    description:
      'A plugin hands over a message from one of its conversations so the AI answers it in that conversation. Only plugins can call it.',
    route: { part: 'inbox_post' },
  },
  {
    name: 'machine_read',
    area: 'assistant',
    access: 'read',
    title: 'Read machines',
    line: 'Where this chat can run',
    description:
      'The machines this chat can run on: name, operating system, sandbox, online and which one is current. Read it before machine_switch.',
    route: { part: 'machine_read' },
  },
  {
    name: 'machine_switch',
    area: 'assistant',
    access: 'control',
    title: 'Switch machine',
    line: 'Move this chat to another machine',
    description:
      'Moves this chat to another machine by id or name from machine_read; your next tool call runs there.',
    route: { part: 'machine_switch' },
  },
  {
    name: 'tool_result_read',
    area: 'assistant',
    access: 'read',
    title: 'Read a full tool result',
    line: 'The whole output of one tool call',
    description:
      'The complete output or input of one earlier tool call in a chat, a page of characters at a time, when the timeline clipped it; callId comes from the tool call and nextCursor continues.',
    route: { part: 'tool_result_read' },
  },
] as const satisfies readonly Served[];

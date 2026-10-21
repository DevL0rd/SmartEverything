import { SHOW_IN_APP_TEXT } from '../app-view';
import type { Served } from './served-types';

export const SERVED_ASSISTANT = [
  {
    name: 'chat_read',
    area: 'assistant',
    access: 'read',
    title: 'Read chats',
    line: 'Chats, search, messages and files',
    description:
      'The caller’s AI chats (filtered by unread, pinned, archived or source), a search through titles and message text, the messages of one chat, their default chat, or one attached file. Returns the chatId other chat tools take.',
    route: {
      key: 'view',
      branches: {
        list: { part: 'chats_list', line: 'Chats, newest first, with filters' },
        search: { part: 'chats_search', line: 'Chats whose title or messages match words' },
        messages: { part: 'chat_read', line: 'The messages of one chat' },
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
      'Manages chats: starts a new one, changes one (title, icon, pin, archive, read, engine, model, tools), branches it, regenerates a reply, stops its run, deletes it or one message. Not for sending a chat work (chat_send) or starting a helper on a task (subagent_run).',
    route: {
      key: 'action',
      branches: {
        create: { part: 'chat_create', line: 'Start a new chat with an optional engine and tools' },
        update: {
          part: 'chat_update',
          line: 'Title, icon, pinned, archived, read, engine or tools',
        },
        branch: { part: 'chat_branch', line: 'Copy a chat up to one message into a new chat' },
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
      'Sends a message from your chat to another of the person’s chats (chatId from chat_read); that chat’s AI works on it and its answer comes back to you, waited for or as a report later. Not for managing chats (chat_edit).',
    route: { part: 'chat_send' },
  },
  {
    name: 'subagent_run',
    area: 'assistant',
    access: 'control',
    title: 'Run a subagent',
    line: 'A helper chat works on a task',
    description:
      'Starts a helper chat on one task with its own engine, model and tools and returns its answer, waited for or as a report later. It sees only the task text, so include everything it needs. Not for messaging an existing chat (chat_send).',
    route: { part: 'subagent_run' },
  },
  {
    name: 'chat_post',
    area: 'assistant',
    access: 'control',
    title: 'Post to a chat',
    line: 'A message with files in their chat',
    description:
      'Posts a message with optional files into a person’s AI chat, with or without a notification, for results they should keep. Not for a short alert (person_notify).',
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
    line: 'Open or point at something in their app',
    description: SHOW_IN_APP_TEXT,
    route: { part: 'app_show' },
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

import {
  PLUGIN_CHAT_BOARDS,
  PLUGIN_TOOL_SEPARATOR,
  type ChatLinkPage,
  type ChatWidget,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { RuleInput, WidgetFacts, WidgetRule } from './rule-input';

const SHOWN = 3;
const ID = z.uuid();

function board(type: string, options?: Readonly<Record<string, string>>): ChatWidget {
  return options === undefined ? { kind: 'board', type } : { kind: 'board', type, options };
}

function boards(...types: readonly string[]): WidgetRule['widgets'] {
  return () => types.map((type) => board(type));
}

function uuidsIn(value: unknown, found: Set<string>): Set<string> {
  if (typeof value === 'string' && ID.safeParse(value).success) {
    found.add(value);
  } else if (Array.isArray(value)) {
    value.forEach((entry) => uuidsIn(entry, found));
  } else if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach((entry) => uuidsIn(entry, found));
  }
  return found;
}

function idsOf(input: RuleInput): readonly string[] {
  return [...uuidsIn(input.output, uuidsIn(input.args, new Set()))];
}

function textArg(input: RuleInput, key: string): string | null {
  const value = input.args[key];
  return typeof value === 'string' && value !== '' ? value : null;
}

function foundDevices(input: RuleInput, facts: WidgetFacts): ChatWidget[] {
  return idsOf(input)
    .flatMap((id) => {
      const widget = facts.deviceWidget(id);
      return widget === null ? [] : [widget];
    })
    .slice(0, SHOWN);
}

function foundRemotes(input: RuleInput, facts: WidgetFacts): ChatWidget[] {
  return idsOf(input)
    .flatMap((id): ChatWidget[] => (facts.remoteId(id) === null ? [] : [{ kind: 'remote', id }]))
    .slice(0, SHOWN);
}

type IdLink = 'automation_link' | 'scheduled_link';

function entityLinks(kind: IdLink): WidgetRule['widgets'] {
  return (input) =>
    idsOf(input)
      .slice(0, SHOWN * 3)
      .map((id): ChatWidget => ({ kind, id, value: null }));
}

function pageLink(page: ChatLinkPage, key: string | null): WidgetRule['widgets'] {
  return (input) => {
    const named = key === null ? null : textArg(input, key);
    const id = named ?? (key === null ? null : (idsOf(input)[0] ?? null));
    return [{ kind: 'page_link', page, id, value: null }];
  };
}

function settingPage(setting: string): WidgetRule['widgets'] {
  return () => [{ kind: 'setting_link', setting, value: null }];
}

function talkWidgets(input: RuleInput): ChatWidget[] {
  const channelId = textArg(input, 'channelId');
  return channelId === null ? [board('talk-channels')] : [board('talk-channel', { channelId })];
}

export function pluginOfTool(name: string): string | null {
  const at = name.indexOf(PLUGIN_TOOL_SEPARATOR);
  return at > 0 ? name.slice(0, at) : null;
}

export function pluginWidgets(pluginId: string, facts: WidgetFacts): ChatWidget[] {
  if (!facts.pluginIds().includes(pluginId)) {
    return [];
  }
  const types = PLUGIN_CHAT_BOARDS[pluginId] ?? [];
  return types.length === 0
    ? [{ kind: 'page_link', page: 'plugin', id: pluginId, value: null }]
    : types.map((type) => board(type));
}

function pluginTool(input: RuleInput, facts: WidgetFacts): ChatWidget[] {
  const named = textArg(input, 'pluginId') ?? pluginOfTool(textArg(input, 'name') ?? '');
  return named === null ? [] : pluginWidgets(named, facts);
}

function pluginList(input: RuleInput, facts: WidgetFacts): ChatWidget[] {
  return facts
    .pluginIds()
    .filter((id) => JSON.stringify(input.output).includes(`"${id}"`))
    .slice(0, SHOWN)
    .flatMap((id) => pluginWidgets(id, facts));
}

export const FIRST_RULES: readonly WidgetRule[] = [
  {
    tools: ['update_plugin', 'restart_plugin', 'list_plugin_tools', 'read_plugin_data'],
    widgets: pluginTool,
  },
  { tools: ['read_plugin_log', 'call_plugin_tool'], widgets: pluginTool },
];

export const COVERAGE_RULES: readonly WidgetRule[] = [
  { tools: ['get_home'], widgets: boards('glance', 'rooms') },
  { tools: ['sync_provider'], widgets: boards('favourites') },
  { tools: ['search_everything', 'list_devices'], widgets: foundDevices },
  { tools: ['list_remotes'], widgets: foundRemotes },
  { tools: ['read_phone_context', 'run_phone_action'], widgets: boards('phone') },
  { tools: ['read_watch_config', 'run_watch_action'], widgets: boards('watch') },
  { tools: ['read_watch_workout'], widgets: boards('watch-workout') },
  { tools: ['read_watch_days'], widgets: boards('stress') },
  { tools: ['list_events'], widgets: boards('security', 'camera-events') },
  { tools: ['read_signal'], widgets: boards('glance') },
  { tools: ['list_automations', 'run_automation'], widgets: entityLinks('automation_link') },
  {
    tools: ['list_scheduled', 'schedule_actions', 'cancel_scheduled', 'run_scheduled'],
    widgets: entityLinks('scheduled_link'),
  },
  {
    tools: ['find_food', 'list_foods', 'create_food', 'update_food', 'delete_food'],
    widgets: () => [
      { kind: 'nutrition', part: 'calories' },
      { kind: 'nutrition', part: 'macros' },
    ],
  },
  { tools: ['assign_body_reading'], widgets: boards('body') },
  { tools: ['list_people'], widgets: settingPage('profiles') },
  { tools: ['create_profile'], widgets: pageLink('person', 'profileId') },
  { tools: ['get_settings'], widgets: settingPage('home') },
  { tools: ['read_firewall', 'check_firewall'], widgets: settingPage('server/firewall') },
  { tools: ['read_assistant', 'set_assistant_responder'], widgets: settingPage('assistant') },
  { tools: ['get_ai_defaults', 'set_ai_defaults'], widgets: settingPage('assistant/openrouter') },
  { tools: ['read_ai_budget'], widgets: settingPage('assistant/budget') },
  {
    tools: ['list_models', 'get_model', 'assistant_models', 'refresh_models'],
    widgets: settingPage('assistant/openrouter/models'),
  },
  {
    tools: [
      'read_talk',
      'list_talk_messages',
      'create_talk_channel',
      'update_talk_channel',
      'set_talk_member',
      'remove_talk_member',
    ],
    widgets: talkWidgets,
  },
  { tools: ['remove_talk_channel'], widgets: boards('talk-channels') },
  { tools: ['chats_list'], widgets: pageLink('chat', null) },
  {
    tools: [
      'chat_read',
      'assistant_history',
      'read_assistant_attachment',
      'chat_create',
      'chat_update',
      'chat_send',
      'subagent_run',
    ],
    widgets: pageLink('chat', 'chatId'),
  },
  {
    tools: ['usage_totals', 'usage_series', 'usage_ledger', 'assistant_usage'],
    widgets: pageLink('costs', null),
  },
  {
    tools: [
      'get_computer',
      'get_computer_history',
      'read_computer_permissions',
      'list_processes',
      'end_process',
      'list_installed_apps',
      'open_app',
      'close_app',
      'list_files',
      'read_file',
    ],
    widgets: foundDevices,
  },
  { tools: ['list_plugins'], widgets: pluginList },
];

export const NO_WIDGET: Readonly<Record<string, string>> = {
  search_places: 'a place lookup that only feeds other tools',
  list_signal_kinds: 'describes signal types, no data',
  list_health_types: 'describes record types, no data',
  remove_room: 'the room is gone',
  remove_scene: 'the scene is gone',
  remove_automation: 'the automation is gone',
  remove_scheduled: 'the scheduled action is gone',
  delete_profile: 'the person is gone',
  read_presence: 'the conversation itself',
  list_conversations: 'the conversation itself',
  list_wakes: 'the conversation itself',
  notify_person: 'the message is the result',
  speak: 'spoken, nothing to show',
  start_conversation: 'the conversation itself',
  call: 'the call screen opens',
  hang_up: 'the call screen closes',
  ai_inbox_post: 'the message is the result',
  assistant_reply: 'the reply is the result',
  assistant_post: 'the message is the result',
  list_operations: 'lists operations only',
  search_tools: 'lists tools only',
  tool_details: 'describes a tool only',
};

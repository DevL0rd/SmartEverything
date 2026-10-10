import { createElement } from 'react';
import type { AssistantSettingsChange } from '@smarteverything/domain';
import {
  ASSISTANT_INSTRUCTIONS_MAX,
  ASSISTANT_NAME_MAX,
  COMPACT_AT_PERCENT,
  REUSE_CHAT_MINUTES,
  assistantLabel,
} from '@smarteverything/domain';
import {
  clearAssistantMessages,
  openClaudeDesktop,
  updateAssistantSettings,
} from '../../api/assistant';
import type { SettingContext, SettingDefinition, SettingEnv } from '../../settings/types';
import type { StoreState } from '../../store/state';
import { forgetOlderMessages } from './data/history';
import { OPENROUTER_SETTINGS } from './settings/openrouter-settings';
import type { ResponderApp } from '@smarteverything/domain';
import { BackendChoices, BACKENDS } from './settings/backend-choices';
import { BUDGET_SETTINGS } from './settings/budget-settings';
import { REACH_SETTINGS } from './reach/reach-settings';
import { ConnectionRow } from './settings/connection-row';
import { DefaultModelRow } from './settings/default-model-row';
import type { WorkerEngine } from './picker/engine-models';

const owner = (env: { readonly owner: boolean }): boolean => env.owner;

const known = (state: StoreState): boolean => state.assistant !== null;

class AssistantNotLoadedError extends Error {
  override readonly name = 'AssistantNotLoadedError';

  constructor() {
    super('The assistant settings have not loaded yet; try again in a moment.');
  }
}

async function writeLiveVideo(value: boolean, context: SettingContext): Promise<void> {
  const voice = context.state.assistant?.settings.voice;
  if (voice === undefined) {
    throw new AssistantNotLoadedError();
  }
  await write({ voice: { ...voice, live_video: value } }, context);
}

const IDLE_CHOICES = [
  { value: '5', label: '5 seconds' },
  { value: '10', label: '10 seconds' },
  { value: '15', label: '15 seconds' },
  { value: '30', label: '30 seconds' },
  { value: '60', label: '1 minute' },
  { value: '120', label: '2 minutes' },
  { value: '300', label: '5 minutes' },
] as const;

const REUSE_CHAT_CHOICES = [
  { value: '0', label: 'Never: a new chat each time' },
  { value: '15', label: '15 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '60', label: '1 hour' },
  { value: '120', label: '2 hours' },
  { value: '240', label: '4 hours' },
  { value: '480', label: '8 hours' },
  { value: '1440', label: '24 hours' },
] as const;

async function write(change: AssistantSettingsChange, context: SettingContext): Promise<void> {
  const status = await updateAssistantSettings(change);
  context.store.update((state) => ({ ...state, assistant: status }));
}

async function writeIdleSeconds(value: string, context: SettingContext): Promise<void> {
  const voice = context.state.assistant?.settings.voice;
  if (voice === undefined) {
    throw new AssistantNotLoadedError();
  }
  await write({ voice: { ...voice, idle_seconds: Number(value) } }, context);
}

const desktopOwner = (env: SettingEnv): boolean => env.owner && env.platform === 'desktop';

function backendPage(
  kind: WorkerEngine,
  app: ResponderApp,
  label: string,
): readonly SettingDefinition[] {
  const page = BACKENDS[kind].page;
  return [
    {
      id: `${page}.connection`,
      page,
      title: 'Connection',
      keywords: ['connect', 'repair', 'disconnect', label.toLowerCase()],
      scope: 'server',
      control: 'custom',
      row: true,
      render: () => createElement(ConnectionRow, { app }),
    },
    {
      id: `${page}.default-model`,
      page,
      title: 'Default for new chats',
      keywords: ['model', 'thinking', label.toLowerCase()],
      scope: 'server',
      control: 'custom',
      row: true,
      render: () => createElement(DefaultModelRow, { backend: kind }),
    },
  ];
}

export const SETTINGS: readonly SettingDefinition[] = [
  {
    id: 'assistant.name',
    page: 'assistant',
    title: 'Name',
    description: 'Also its wake word.',
    keywords: ['name', 'wake word', 'coordinator', 'call it'],
    scope: 'server',
    control: 'text',
    placeholder: 'Coordinator',
    maxLength: ASSISTANT_NAME_MAX,
    beforeSubPages: true,
    visible: owner,
    when: known,
    read: (state) => (state.assistant === null ? '' : assistantLabel(state.assistant.settings)),
    write: (value, context) => write({ name: value.trim() === '' ? null : value.trim() }, context),
  },
  ...OPENROUTER_SETTINGS,
  ...BUDGET_SETTINGS,
  ...REACH_SETTINGS,
  {
    id: 'assistant.backend',
    page: 'assistant/responder',
    title: 'AI backend',
    keywords: ['ai backend', 'openrouter', 'claude code', 'codex', 'who answers'],
    scope: 'server',
    control: 'custom',
    render: () => createElement(BackendChoices),
  },
  ...backendPage('claude-session', 'claude-code', 'Claude Code'),
  {
    id: 'assistant/claude-code.desktop',
    page: 'assistant/claude-code',
    title: 'Open Claude Desktop',
    description: 'Shows the conversation of your latest Claude Code chat.',
    keywords: ['claude desktop', 'open'],
    scope: 'server',
    control: 'action',
    visible: desktopOwner,
    run: openClaudeDesktop,
  },
  ...backendPage('codex-thread', 'codex', 'Codex'),
  {
    id: 'assistant.steps',
    page: 'assistant',
    section: 'Conversation',
    title: 'Show working steps',
    description: 'A live list of what it’s doing while it works.',
    keywords: ['activity', 'progress', 'steps'],
    scope: 'server',
    control: 'switch',
    visible: owner,
    when: known,
    read: (state) => state.assistant?.settings.activity_steps === true,
    write: (value, context) => write({ activity_steps: value }, context),
  },
  {
    id: 'assistant.compact',
    page: 'assistant',
    section: 'Conversation',
    title: 'Compact chats at',
    description: 'Older messages get summarized at this point.',
    keywords: ['compact', 'compaction', 'context', 'summarize', 'memory', 'long chats'],
    scope: 'server',
    control: 'stepper',
    min: COMPACT_AT_PERCENT.min,
    max: COMPACT_AT_PERCENT.max,
    step: COMPACT_AT_PERCENT.step,
    format: (value) => `${String(value)}%`,
    visible: owner,
    when: known,
    read: (state) => state.assistant?.settings.compact_at_percent ?? COMPACT_AT_PERCENT.fallback,
    write: (value, context) => write({ compact_at_percent: value }, context),
  },
  {
    id: 'assistant.reuse-chat',
    page: 'assistant',
    section: 'Conversation',
    title: 'Keep the same chat for',
    description:
      'Calls and conversations the AI starts continue your latest one if it was active this recently.',
    keywords: [
      'reuse chat',
      'same conversation',
      'same chat',
      'new chat after',
      'conversation chat',
      'timeout',
      'calls',
      'wake word',
    ],
    scope: 'server',
    control: 'select',
    options: REUSE_CHAT_CHOICES,
    visible: owner,
    when: known,
    read: (state) => String(state.assistant?.settings.reuse_chat_minutes ?? REUSE_CHAT_MINUTES),
    write: (value, context) => write({ reuse_chat_minutes: Number(value) }, context),
  },
  {
    id: 'assistant.voice.idle',
    page: 'assistant',
    section: 'Voice calls',
    title: 'End after silence',
    description: 'Hangs up a call or camera conversation when nobody has spoken for this long.',
    keywords: ['hang up', 'timeout', 'silence', 'idle', 'end conversation', 'voice', 'call'],
    scope: 'server',
    control: 'select',
    options: IDLE_CHOICES,
    visible: owner,
    when: known,
    read: (state) => String(state.assistant?.settings.voice.idle_seconds ?? 5),
    write: writeIdleSeconds,
  },
  {
    id: 'assistant.voice.live-video',
    page: 'assistant',
    section: 'Voice calls',
    title: 'Live video in camera calls',
    description: 'The AI watches the camera during the call. Costs more.',
    keywords: ['live video', 'camera video', 'see', 'watch', 'vision'],
    scope: 'server',
    control: 'switch',
    visible: owner,
    when: known,
    read: (state) => state.assistant?.settings.voice.live_video === true,
    write: writeLiveVideo,
  },
  {
    id: 'assistant.instructions',
    page: 'assistant',
    section: 'Conversation',
    title: 'Custom instructions',
    keywords: ['prompt', 'instructions', 'rules'],
    scope: 'server',
    control: 'text',
    placeholder: 'Anything it should always keep in mind',
    maxLength: ASSISTANT_INSTRUCTIONS_MAX,
    visible: owner,
    when: known,
    read: (state) => state.assistant?.settings.instructions ?? '',
    write: (value, context) => write({ instructions: value }, context),
  },
  {
    id: 'assistant.clear',
    page: 'assistant/privacy',
    title: 'Clear chat history',
    description: 'Deletes your messages, replies and attachments.',
    keywords: ['delete', 'history', 'privacy', 'messages'],
    scope: 'server',
    control: 'action',
    destructive: true,
    when: known,
    confirm: {
      title: 'Clear your chat history?',
      body: 'Every message and attachment in your assistant chat is deleted.',
      confirmLabel: 'Clear history',
      tone: 'destructive',
    },
    run: async (): Promise<void> => {
      await clearAssistantMessages();
      forgetOlderMessages();
    },
  },
];

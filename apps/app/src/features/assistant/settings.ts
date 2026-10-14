import { createElement } from 'react';
import type { AssistantSettingsChange } from '@smarteverything/domain';
import {
  ASSISTANT_INSTRUCTIONS_MAX,
  ASSISTANT_NAME_MAX,
  COMPACT_AT_PERCENT,
  LIVE_CONTEXT_MINUTES,
  REUSE_CHAT_MINUTES,
  assistantLabel,
} from '@smarteverything/domain';
import { clearAssistantMessages, updateAssistantSettings } from '../../api/assistant';
import type { SettingContext, SettingDefinition } from '../../settings/types';
import type { StoreState } from '../../store/state';
import { forgetOlderMessages } from './data/history';
import { OPENROUTER_SETTINGS } from './settings/openrouter-settings';
import { BUDGET_SETTINGS } from './settings/budget-settings';
import { REACH_SETTINGS } from './reach/reach-settings';
import { CALL_AUDIO_SETTINGS } from './settings/call-audio-settings';
import { SPEECH_SETTINGS } from './settings/speech-settings';
import { RESPONSE_STYLE_SETTINGS } from './settings/response-style-settings';
import { EXTENSION_UPDATE_SETTINGS } from './extensions/update-settings';
import { CallVoiceSettingRow } from './settings/call-voice-setting-row';

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

async function writeMuteMic(value: boolean, context: SettingContext): Promise<void> {
  const voice = context.state.assistant?.settings.voice;
  if (voice === undefined) {
    throw new AssistantNotLoadedError();
  }
  await write({ voice: { ...voice, mute_mic_while_speaking: value } }, context);
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

const LIVE_CONTEXT_CHOICES = [
  { value: '1', label: '1 minute' },
  { value: '2', label: '2 minutes' },
  { value: '4', label: '4 minutes' },
  { value: '8', label: '8 minutes' },
  { value: '15', label: '15 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '60', label: '60 minutes' },
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

async function writeLiveContext(value: string, context: SettingContext): Promise<void> {
  const voice = context.state.assistant?.settings.voice;
  if (voice === undefined) {
    throw new AssistantNotLoadedError();
  }
  await write({ voice: { ...voice, live_context_minutes: Number(value) } }, context);
}

export const SETTINGS: readonly SettingDefinition[] = [
  {
    id: 'assistant.name',
    page: 'assistant',
    icon: 'user',
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
  ...CALL_AUDIO_SETTINGS,
  ...SPEECH_SETTINGS,
  ...RESPONSE_STYLE_SETTINGS,
  ...EXTENSION_UPDATE_SETTINGS,
  {
    id: 'assistant.steps',
    page: 'assistant',
    icon: 'list',
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
    id: 'assistant.reply-cost',
    page: 'assistant',
    icon: 'gauge',
    section: 'Conversation',
    title: 'Show cost under replies',
    description: 'What each reply cost, in small print under it.',
    keywords: ['cost', 'price', 'spend', 'per message', 'money', 'dollars'],
    scope: 'server',
    control: 'switch',
    visible: owner,
    when: known,
    read: (state) => state.assistant?.settings.reply_cost === true,
    write: (value, context) => write({ reply_cost: value }, context),
  },
  {
    id: 'assistant.reply-suggestions',
    page: 'assistant',
    icon: 'sparkles',
    section: 'Conversation',
    title: 'Suggest replies',
    description: 'After an answer, offer a few short replies to tap. Costs a little per answer.',
    keywords: ['suggestions', 'follow-up', 'quick replies', 'suggest', 'smart reply'],
    scope: 'server',
    control: 'switch',
    visible: owner,
    when: known,
    read: (state) => state.assistant?.settings.reply_suggestions === true,
    write: (value, context) => write({ reply_suggestions: value }, context),
  },
  {
    id: 'assistant.compact',
    page: 'assistant',
    icon: 'layers',
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
    icon: 'messageCircle',
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
    id: 'assistant.instructions',
    page: 'assistant',
    icon: 'fileText',
    section: 'Conversation',
    title: 'Custom instructions',
    keywords: ['prompt', 'instructions', 'rules'],
    scope: 'server',
    control: 'text',
    placeholder: 'Anything it should always keep in mind',
    maxLength: ASSISTANT_INSTRUCTIONS_MAX,
    allowEmpty: true,
    multiline: true,
    visible: owner,
    when: known,
    read: (state) => state.assistant?.settings.instructions ?? '',
    write: (value, context) => write({ instructions: value }, context),
  },
  {
    id: 'assistant.voice.call-voice',
    page: 'assistant',
    icon: 'mic',
    section: 'Voice calls',
    title: 'Call voice',
    keywords: ['Gemini', 'Live', 'voice', 'sample', 'preview', 'Sadachbia'],
    scope: 'server',
    control: 'custom',
    row: true,
    visible: owner,
    when: known,
    render: () => createElement(CallVoiceSettingRow),
  },
  {
    id: 'assistant.voice.idle',
    page: 'assistant',
    icon: 'timer',
    section: 'Voice calls',
    title: 'End after silence',
    description:
      'Hangs up a camera conversation or announcement when nobody has spoken for this long. Calls from the AI page stay open until you hang up.',
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
    id: 'assistant.voice.context',
    page: 'assistant',
    icon: 'layers',
    section: 'Voice calls',
    title: 'Call memory',
    description:
      'How much of a call stays in the AI’s head. Older speech is dropped from it, and the transcript keeps the words. Shorter costs less.',
    keywords: [
      'call memory',
      'voice context',
      'context window',
      'remember',
      'tokens',
      'cost',
      'voice',
      'call',
    ],
    scope: 'server',
    control: 'select',
    options: LIVE_CONTEXT_CHOICES,
    visible: owner,
    when: known,
    read: (state) =>
      String(state.assistant?.settings.voice.live_context_minutes ?? LIVE_CONTEXT_MINUTES.fallback),
    write: writeLiveContext,
  },
  {
    id: 'assistant.voice.live-video',
    page: 'assistant',
    icon: 'eye',
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
    id: 'assistant.voice.mute-mic',
    page: 'assistant',
    icon: 'micOff',
    section: 'Voice calls',
    title: 'Mute the camera mic while the AI speaks',
    description:
      'Stops it hearing itself, but you can’t talk over it. Off relies on the camera’s own echo cancellation.',
    keywords: ['echo', 'mute mic', 'camera microphone', 'talk over', 'interrupt', 'hears itself'],
    scope: 'server',
    control: 'switch',
    visible: owner,
    when: known,
    read: (state) => state.assistant?.settings.voice.mute_mic_while_speaking === true,
    write: writeMuteMic,
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

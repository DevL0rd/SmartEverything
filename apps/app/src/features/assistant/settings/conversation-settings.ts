import { createElement } from 'react';
import {
  COMPACT_AT_PERCENT,
  REUSE_CHAT_MINUTES,
  type AssistantSettingsChange,
} from '@smarteverything/domain';
import type { SettingDefinition } from '../../../settings/types';
import type { StoreState } from '../../../store/state';
import { known, owner, writeAssistant } from './assistant-write';
import { OVERLAY_SETTINGS } from '../overlay/overlay-settings';
import { QuickAskShortcutRow } from './quick-ask-shortcut-row';
import { ASSISTANT_GROUPS } from './settings-groups';

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

interface SwitchSpec {
  readonly id: string;
  readonly icon: 'list' | 'gauge' | 'sparkles' | 'image';
  readonly title: string;
  readonly description: string;
  readonly keywords: readonly string[];
  readonly read: (state: StoreState) => boolean;
  readonly change: (value: boolean) => AssistantSettingsChange;
}

function conversationSwitch({ read, change, ...row }: SwitchSpec): SettingDefinition {
  return {
    ...row,
    page: 'assistant',
    section: ASSISTANT_GROUPS.conversation,
    scope: 'server',
    control: 'switch',
    visible: owner,
    when: known,
    read,
    write: (value, context) => writeAssistant(change(value), context),
  };
}

export const CONVERSATION_SETTINGS: readonly SettingDefinition[] = [
  conversationSwitch({
    id: 'assistant.steps',
    icon: 'list',
    title: 'Show working steps',
    description: 'A live list of what it’s doing while it works.',
    keywords: ['activity', 'progress', 'steps'],
    read: (state) => state.assistant?.settings.activity_steps === true,
    change: (value) => ({ activity_steps: value }),
  }),
  conversationSwitch({
    id: 'assistant.reply-cost',
    icon: 'gauge',
    title: 'Show cost under replies',
    description: 'What each reply cost, in small print under it.',
    keywords: ['cost', 'price', 'spend', 'per message', 'money', 'dollars'],
    read: (state) => state.assistant?.settings.reply_cost === true,
    change: (value) => ({ reply_cost: value }),
  }),
  conversationSwitch({
    id: 'assistant.describe-images',
    icon: 'image',
    title: 'Describe images automatically',
    description:
      'Adds a short text description to images in the chat history. Applies to models that can already see images. Models that cannot see images always get a description.',
    keywords: ['images', 'describe', 'caption', 'pictures', 'screenshots', 'vision'],
    read: (state) => state.assistant?.settings.describe_images === true,
    change: (value) => ({ describe_images: value }),
  }),
  conversationSwitch({
    id: 'assistant.reply-suggestions',
    icon: 'sparkles',
    title: 'Suggest replies',
    description: 'After an answer, offer a few short replies to tap. Costs a little per answer.',
    keywords: ['suggestions', 'follow-up', 'quick replies', 'suggest', 'smart reply'],
    read: (state) => state.assistant?.settings.reply_suggestions === true,
    change: (value) => ({ reply_suggestions: value }),
  }),
  {
    id: 'assistant.compact',
    page: 'assistant',
    icon: 'layers',
    section: ASSISTANT_GROUPS.conversation,
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
    write: (value, context) => writeAssistant({ compact_at_percent: value }, context),
  },
  {
    id: 'assistant.reuse-chat',
    page: 'assistant',
    icon: 'messageCircle',
    section: ASSISTANT_GROUPS.conversation,
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
    write: (value, context) => writeAssistant({ reuse_chat_minutes: Number(value) }, context),
  },
  {
    id: 'assistant.quick-ask-shortcut',
    page: 'assistant',
    section: ASSISTANT_GROUPS.conversation,
    title: 'Quick Ask shortcut',
    keywords: ['quick ask', 'shortcut', 'keyboard', 'hotkey', 'spotlight', 'command space'],
    scope: 'device-local',
    control: 'custom',
    row: true,
    visible: (env) => env.platform !== 'android',
    render: () => createElement(QuickAskShortcutRow),
  },
  ...OVERLAY_SETTINGS,
];

import {
  ASSISTANT_INSTRUCTIONS_MAX,
  ASSISTANT_NAME_MAX,
  assistantLabel,
} from '@smarteverything/domain';
import { createElement } from 'react';
import type { SettingDefinition } from '../../settings/types';
import { REACH_SETTINGS } from './reach/reach-settings';
import { EXTENSION_UPDATE_SETTINGS } from './extensions/update-settings';
import { known, owner, writeAssistant } from './settings/assistant-write';
import { BUDGET_SETTINGS } from './settings/budget-settings';
import { CALL_AUDIO_SETTINGS } from './settings/call-audio-settings';
import { CONVERSATION_SETTINGS } from './settings/conversation-settings';
import { PRIVACY_SETTINGS } from './settings/privacy-settings';
import { OPENROUTER_SETTINGS } from './settings/openrouter-settings';
import { RESPONSE_STYLE_SETTINGS } from './settings/response-style-settings';
import { ASSISTANT_GROUPS, assistantPageLink } from './settings/settings-groups';
import { EarHostSetting } from './listening/ear-host-setting';
import { WakeTestCard } from './settings/wake-test/wake-test-card';
import { GEMINI_KEY_SETTING, VOICE_SETTINGS } from './settings/voice-settings';

const IDENTITY_SETTINGS: readonly SettingDefinition[] = [
  {
    id: 'assistant.name',
    page: 'assistant',
    icon: 'user',
    section: ASSISTANT_GROUPS.assistant,
    title: 'Name',
    description: 'Also its wake word.',
    keywords: ['name', 'wake word', 'coordinator', 'call it'],
    scope: 'server',
    control: 'text',
    placeholder: 'Coordinator',
    maxLength: ASSISTANT_NAME_MAX,
    visible: owner,
    when: known,
    read: (state) => (state.assistant === null ? '' : assistantLabel(state.assistant.settings)),
    write: (value, context) => writeAssistant({ name: value.trim() }, context),
  },
  assistantPageLink('assistant/response-style', ASSISTANT_GROUPS.assistant),
  {
    id: 'assistant.instructions',
    page: 'assistant',
    icon: 'fileText',
    section: ASSISTANT_GROUPS.assistant,
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
    write: (value, context) => writeAssistant({ instructions: value }, context),
  },
  {
    id: 'assistant.wake-test',
    page: 'assistant',
    section: ASSISTANT_GROUPS.assistant,
    title: 'Test the wake word',
    description: 'See what the ears hear and add other names it should answer to.',
    keywords: ['wake word', 'test', 'alias', 'aliases', 'other names', 'listening', 'misheard'],
    scope: 'server',
    control: 'custom',
    visible: owner,
    when: known,
    render: () => createElement(WakeTestCard),
  },
  {
    id: 'assistant.ear-host',
    page: 'assistant/listening',
    title: 'Computer that listens for cameras, walkie and Discord',
    description: 'Which computer hears the wake word for cameras, walkie channels and Discord.',
    keywords: ['ear host', 'listening', 'wake word', 'camera', 'walkie', 'discord', 'headless'],
    scope: 'server',
    control: 'custom',
    visible: owner,
    when: known,
    render: () => createElement(EarHostSetting),
  },
];

const NAVIGATION_SETTINGS: readonly SettingDefinition[] = [
  assistantPageLink('assistant/reach'),
  assistantPageLink('assistant/listening'),
  assistantPageLink('assistant/phone'),
  assistantPageLink('assistant/budget', ASSISTANT_GROUPS.budget),
  assistantPageLink('assistant/costs', ASSISTANT_GROUPS.budget),
  assistantPageLink('assistant/extensions', ASSISTANT_GROUPS.addOns),
  assistantPageLink('assistant/skills', ASSISTANT_GROUPS.addOns),
  assistantPageLink('assistant/integrations', ASSISTANT_GROUPS.addOns),
  assistantPageLink('assistant/privacy', ASSISTANT_GROUPS.privacy),
];

export const SETTINGS: readonly SettingDefinition[] = [
  ...IDENTITY_SETTINGS,
  assistantPageLink('assistant/models', ASSISTANT_GROUPS.models),
  ...OPENROUTER_SETTINGS,
  ...CONVERSATION_SETTINGS,
  ...VOICE_SETTINGS,
  assistantPageLink('assistant/calls', ASSISTANT_GROUPS.voice),
  GEMINI_KEY_SETTING,
  ...NAVIGATION_SETTINGS,
  ...BUDGET_SETTINGS,
  ...REACH_SETTINGS,
  ...CALL_AUDIO_SETTINGS,
  ...RESPONSE_STYLE_SETTINGS,
  ...EXTENSION_UPDATE_SETTINGS,
  ...PRIVACY_SETTINGS,
];

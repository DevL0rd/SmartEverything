import {
  captureAssistantWrite,
  assertAssistantWriteCurrent,
} from '../../../store/assistant-response-style';
import { createElement } from 'react';
import {
  RESPONSE_PERSONALITIES,
  RESPONSE_VERBOSITIES,
  RESPONSE_FORMATS,
  RESPONSE_PERSONALITY,
  RESPONSE_VERBOSITY,
  RESPONSE_FORMAT,
  CUSTOM_PERSONALITY_MAX,
  type AssistantSettingsChange,
} from '@smarteverything/domain';
import type { SettingContext, SettingDefinition } from '../../../settings/types';
import type { StoreState } from '../../../store/state';
import { updateAssistantSettings } from '../../../api/assistant';
import { ResponseStyleAvailability } from './response-style-availability';
const owner = (env: { readonly owner: boolean }): boolean => env.owner;
const known = (state: StoreState): boolean =>
  state.assistant?.settings.response_style !== undefined;
async function write(
  style: AssistantSettingsChange['response_style'],
  context: SettingContext,
): Promise<void> {
  if (!known(context.store.get()))
    throw new Error('Response style is unavailable. Update or reconnect the hub.');
  const scope = captureAssistantWrite(context.store);
  const status = await updateAssistantSettings({ response_style: style }, scope);
  assertAssistantWriteCurrent(scope);
  context.store.update((state) => ({ ...state, assistant: status }));
}
const base = {
  page: 'assistant',
  section: 'Response style',
  scope: 'server',
  visible: owner,
  when: known,
} as const;
export const RESPONSE_STYLE_SETTINGS: readonly SettingDefinition[] = [
  {
    ...base,
    id: 'assistant.style.availability',
    title: 'Response style availability',
    keywords: ['tone', 'style', 'update'],
    control: 'custom',
    when: (state) => state.assistant !== null,
    render: () => createElement(ResponseStyleAvailability),
  },
  {
    ...base,
    id: 'assistant.style.personality',
    title: 'Personality',
    description: 'Tone only; keeps its name, instructions and permissions.',
    keywords: ['personality', 'tone', 'warm', 'direct', 'playful', 'wry', 'custom'],
    control: 'select',
    options: RESPONSE_PERSONALITIES.map((row) => ({
      value: row.value,
      label: row.label,
      description: row.description,
    })),
    read: (state) => state.assistant?.settings.response_style?.personality ?? 'default',
    write: (value, context) => write({ personality: RESPONSE_PERSONALITY.parse(value) }, context),
  },
  {
    ...base,
    id: 'assistant.style.verbosity',
    title: 'Verbosity',
    description: 'Explanation depth, independently of thinking effort.',
    keywords: ['verbosity', 'detail', 'brief', 'length'],
    control: 'select',
    options: RESPONSE_VERBOSITIES,
    read: (state) => state.assistant?.settings.response_style?.verbosity ?? 'balanced',
    write: (value, context) => write({ verbosity: RESPONSE_VERBOSITY.parse(value) }, context),
  },
  {
    ...base,
    id: 'assistant.style.format',
    title: 'Formatting',
    description: 'A preference; useful code, tables and diagrams still fit the task.',
    keywords: ['format', 'paragraphs', 'lists', 'adaptive'],
    control: 'select',
    options: RESPONSE_FORMATS,
    read: (state) => state.assistant?.settings.response_style?.format ?? 'adaptive',
    write: (value, context) => write({ format: RESPONSE_FORMAT.parse(value) }, context),
  },
  {
    ...base,
    id: 'assistant.style.custom',
    title: 'Custom personality',
    description:
      'Empty means no additional tone guidance. Saved text stays when you switch personality.',
    keywords: ['custom', 'personality', 'instructions', 'tone'],
    control: 'text',
    allowEmpty: true,
    multiline: true,
    placeholder: 'Describe the tone you prefer',
    maxLength: CUSTOM_PERSONALITY_MAX,
    when: (state) => state.assistant?.settings.response_style?.personality === 'custom',
    read: (state) => state.assistant?.settings.response_style?.custom_personality ?? '',
    write: (value, context) => write({ custom_personality: value }, context),
  },
  {
    ...base,
    id: 'assistant.style.reset',
    title: 'Reset tone, verbosity and formatting',
    description: 'Keeps custom personality text and owner instructions.',
    keywords: ['reset', 'default', 'style'],
    control: 'action',
    run: (context) =>
      write({ personality: 'default', verbosity: 'balanced', format: 'adaptive' }, context),
  },
];

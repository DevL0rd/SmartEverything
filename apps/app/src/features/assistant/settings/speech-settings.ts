import { createElement } from 'react';
import {
  CHEAPEST_SPEECH_MODEL,
  SPEECH_MODELS,
  SPEECH_MODEL_LABELS,
  type AssistantSettingsChange,
  type SpeechModel,
} from '@smarteverything/domain';
import { updateAssistantSettings } from '../../../api/assistant';
import type { SettingContext, SettingDefinition } from '../../../settings/types';
import type { StoreState } from '../../../store/state';

import { SpokenLineVoiceSettingRow } from './call-voice-setting-row';

class SpeechChoiceError extends Error {
  override readonly name = 'SpeechChoiceError';

  constructor(value: string) {
    super(`${value} is not a spoken-line model this hub knows.`);
  }
}

class SpeechNotLoadedError extends Error {
  override readonly name = 'SpeechNotLoadedError';

  constructor() {
    super('The assistant settings have not loaded yet; try again in a moment.');
  }
}

const owner = (env: { readonly owner: boolean }): boolean => env.owner;

const known = (state: StoreState): boolean => state.assistant !== null;

function modelOf(value: string): SpeechModel {
  const model = SPEECH_MODELS.find((candidate) => candidate === value);
  if (model === undefined) {
    throw new SpeechChoiceError(value);
  }
  return model;
}

async function write(
  change: (
    voice: NonNullable<StoreState['assistant']>['settings']['voice'],
  ) => AssistantSettingsChange['voice'],
  context: SettingContext,
): Promise<void> {
  const voice = context.state.assistant?.settings.voice;
  if (voice === undefined) {
    throw new SpeechNotLoadedError();
  }
  const status = await updateAssistantSettings({ voice: change(voice) });
  context.store.update((state) => ({ ...state, assistant: status }));
}

const MODEL_CHOICES = SPEECH_MODELS.map((model) => ({
  value: model,
  label: SPEECH_MODEL_LABELS[model],
}));

export const SPEECH_SETTINGS: readonly SettingDefinition[] = [
  {
    id: 'assistant.voice.speech-model',
    page: 'assistant',
    icon: 'speaker',
    section: 'Spoken lines',
    title: 'Spoken lines',
    description:
      'What says one-off lines (announcements, speaking through a speaker without a conversation): text in, voice out, no conversation. The cheapest is the default.',
    keywords: ['announce', 'speak', 'text to speech', 'tts', 'cost', 'cheap', 'voice', 'speaker'],
    scope: 'server',
    control: 'select',
    options: MODEL_CHOICES,
    visible: owner,
    when: known,
    read: (state) => state.assistant?.settings.voice.speech_model ?? CHEAPEST_SPEECH_MODEL,
    write: (value, context) =>
      write((voice) => ({ ...voice, speech_model: modelOf(value) }), context),
  },
  {
    id: 'assistant.voice.speech-voice',
    page: 'assistant',
    icon: 'mic',
    section: 'Spoken lines',
    title: 'Voice for spoken lines',
    description: 'Choose the same voice as calls to keep the AI sounding like itself.',
    keywords: ['announce', 'speak', 'voice', 'text to speech', 'tts'],
    scope: 'server',
    control: 'custom',
    row: true,
    visible: owner,
    when: known,
    render: () => createElement(SpokenLineVoiceSettingRow),
  },
];

import { createElement } from 'react';
import {
  CHEAPEST_SPEECH_MODEL,
  SPEECH_MODELS,
  SPEECH_MODEL_LABELS,
  type SpeechModel,
} from '@smarteverything/domain';
import type { SettingDefinition } from '../../../settings/types';
import { known, owner, writeVoice } from './assistant-write';
import { SpokenLineVoiceSettingRow } from './call-voice-setting-row';
import { ASSISTANT_GROUPS } from './settings-groups';

class SpeechChoiceError extends Error {
  override readonly name = 'SpeechChoiceError';

  constructor(value: string) {
    super(`${value} is not a spoken-line model this hub knows.`);
  }
}

function modelOf(value: string): SpeechModel {
  const model = SPEECH_MODELS.find((candidate) => candidate === value);
  if (model === undefined) {
    throw new SpeechChoiceError(value);
  }
  return model;
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
    section: ASSISTANT_GROUPS.voice,
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
    write: (value, context) => writeVoice({ speech_model: modelOf(value) }, context),
  },
  {
    id: 'assistant.voice.speech-voice',
    page: 'assistant',
    icon: 'mic',
    section: ASSISTANT_GROUPS.voice,
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

import { DEFAULT_VOICE_THINKING } from '@smarteverything/domain';
import type { SelectSetting } from '../../../settings/types';
import { known, owner, writeVoice } from './assistant-write';
import { ASSISTANT_GROUPS } from './settings-groups';
import { VOICE_THINKING_DESCRIPTION, VOICE_THINKING_OPTIONS, thinkingLevelOf } from './voice-model';

export const THINKING_SETTING: SelectSetting = {
  page: 'assistant',
  section: ASSISTANT_GROUPS.voiceModel,
  scope: 'server',
  visible: owner,
  when: known,
  id: 'assistant.voice.thinking',
  icon: 'brain',
  title: 'Thinking',
  description: VOICE_THINKING_DESCRIPTION,
  keywords: [
    'thinking',
    'reasoning',
    'smarter',
    'faster',
    'think',
    'level',
    'voice model',
    'call model',
    'Gemini',
    'extended thinking',
  ],
  control: 'select',
  options: VOICE_THINKING_OPTIONS,
  read: (state) => state.assistant?.settings.voice.thinking_level ?? DEFAULT_VOICE_THINKING,
  write: (value, context) => writeVoice({ thinking_level: thinkingLevelOf(value) }, context),
};

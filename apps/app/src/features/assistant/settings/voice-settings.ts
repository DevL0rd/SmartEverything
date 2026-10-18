import { createElement } from 'react';
import { LIVE_CONTEXT_MINUTES } from '@smarteverything/domain';
import type { SettingDefinition } from '../../../settings/types';
import { known, owner, writeVoice } from './assistant-write';
import { CallVoiceSettingRow } from './call-voice-setting-row';
import { GeminiKeySection } from './gemini-key';
import { ASSISTANT_GROUPS } from './settings-groups';
import { SPEECH_SETTINGS } from './speech-settings';

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

const SPEECH_CONTEXT_CHOICES = [
  { value: '0', label: 'Off' },
  { value: '1', label: '1 minute' },
  { value: '2', label: '2 minutes' },
  { value: '5', label: '5 minutes' },
  { value: '10', label: '10 minutes' },
  { value: '30', label: '30 minutes' },
] as const;

const base = {
  page: 'assistant',
  section: ASSISTANT_GROUPS.voice,
  scope: 'server',
  visible: owner,
  when: known,
} as const;

const CALL_VOICE: SettingDefinition = {
  ...base,
  id: 'assistant.voice.call-voice',
  icon: 'mic',
  title: 'Call voice',
  keywords: ['Gemini', 'Live', 'voice', 'sample', 'preview', 'Sadachbia'],
  control: 'custom',
  row: true,
  render: () => createElement(CallVoiceSettingRow),
};

const CALL_RULES: readonly SettingDefinition[] = [
  {
    ...base,
    id: 'assistant.voice.idle',
    icon: 'timer',
    title: 'End after silence',
    description:
      'Hangs up a camera conversation or announcement when nobody has spoken for this long. Calls from the AI page stay open until you hang up.',
    keywords: ['hang up', 'timeout', 'silence', 'idle', 'end conversation', 'voice', 'call'],
    control: 'select',
    options: IDLE_CHOICES,
    read: (state) => String(state.assistant?.settings.voice.idle_seconds ?? 5),
    write: (value, context) => writeVoice({ idle_seconds: Number(value) }, context),
  },
  {
    ...base,
    id: 'assistant.voice.context',
    icon: 'layers',
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
    control: 'select',
    options: LIVE_CONTEXT_CHOICES,
    read: (state) =>
      String(state.assistant?.settings.voice.live_context_minutes ?? LIVE_CONTEXT_MINUTES.fallback),
    write: (value, context) => writeVoice({ live_context_minutes: Number(value) }, context),
  },
  {
    ...base,
    id: 'assistant.voice.speech-context',
    icon: 'audioLines',
    title: 'Recent speech in camera calls',
    description:
      'When a camera call starts, the AI is told what that camera’s transcription heard in this many minutes before. Needs transcription on for the camera.',
    keywords: ['recent speech', 'transcription', 'heard', 'context', 'camera call', 'wake word'],
    control: 'select',
    options: SPEECH_CONTEXT_CHOICES,
    read: (state) => String(state.assistant?.settings.voice.speech_context_minutes ?? 5),
    write: (value, context) => writeVoice({ speech_context_minutes: Number(value) }, context),
  },
  {
    ...base,
    id: 'assistant.voice.live-video',
    icon: 'eye',
    title: 'Live video in camera calls',
    description: 'The AI watches the camera during the call. Costs more.',
    keywords: ['live video', 'camera video', 'see', 'watch', 'vision'],
    control: 'switch',
    read: (state) => state.assistant?.settings.voice.live_video === true,
    write: (value, context) => writeVoice({ live_video: value }, context),
  },
  {
    ...base,
    id: 'assistant.voice.warm',
    icon: 'plug',
    title: 'Keep the AI connection ready',
    description:
      'Calls start at once because the connection stays open between calls. Turn off to connect fresh for every call.',
    keywords: ['warm', 'connection', 'fast start', 'latency', 'Gemini', 'voice', 'call'],
    control: 'switch',
    read: (state) => state.assistant?.settings.voice.live_warm_enabled !== false,
    write: (value, context) => writeVoice({ live_warm_enabled: value }, context),
  },
  {
    ...base,
    id: 'assistant.voice.mute-mic',
    icon: 'micOff',
    title: 'Mute the camera mic while the AI speaks',
    description:
      'Stops it hearing itself, but you can’t talk over it. Off relies on the camera’s own echo cancellation.',
    keywords: ['echo', 'mute mic', 'camera microphone', 'talk over', 'interrupt', 'hears itself'],
    control: 'switch',
    read: (state) => state.assistant?.settings.voice.mute_mic_while_speaking === true,
    write: (value, context) => writeVoice({ mute_mic_while_speaking: value }, context),
  },
  {
    ...base,
    id: 'assistant.voice.pause-media',
    icon: 'pause',
    title: 'Pause room media while the AI speaks',
    description:
      'Music and video in the same room pause while it talks, and only what it paused resumes afterwards.',
    keywords: ['pause', 'media', 'music', 'tv', 'duck', 'quiet', 'room', 'speaking', 'resume'],
    control: 'switch',
    read: (state) => state.assistant?.settings.voice.pause_media_while_speaking !== false,
    write: (value, context) => writeVoice({ pause_media_while_speaking: value }, context),
  },
];

export const VOICE_SETTINGS: readonly SettingDefinition[] = [
  CALL_VOICE,
  ...SPEECH_SETTINGS,
  ...CALL_RULES,
];

export const GEMINI_KEY_SETTING: SettingDefinition = {
  id: 'assistant.voice.gemini-key',
  page: 'assistant',
  title: 'Gemini key',
  description: 'The key voice calls and spoken lines use.',
  keywords: ['gemini', 'api key', 'voice key', 'paste key', 'import key', 'aibinator', 'google'],
  scope: 'server',
  control: 'custom',
  render: () => createElement(GeminiKeySection),
};

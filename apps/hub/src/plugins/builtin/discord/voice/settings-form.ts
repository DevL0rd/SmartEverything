import {
  DEFAULT_PAUSE_MS,
  WAKE_SENSITIVITIES,
  WAKE_SENSITIVITY_HINTS,
  WAKE_SENSITIVITY_LABELS,
  type PluginManifestInput,
} from '@smarteverything/domain';

type Form = NonNullable<NonNullable<PluginManifestInput['contributes']>['settings']>;

const GROUP = 'Voice calls';

export const VOICE_SETTINGS_FORM: Form = {
  voice_enabled: {
    type: 'boolean',
    title: 'Voice calls',
    description:
      'Join voice channels, write down what is said and talk when someone says its name, its Discord name or one of the other names anywhere in a sentence. Needs a Gemini key in the voice settings.',
    default: true,
    group: GROUP,
  },
  voice_auto_join: {
    type: 'boolean',
    title: 'Join when an approved person arrives',
    description:
      'Joins the voice channel an approved person enters, in servers and channels it works in. It never follows people out. /join and /leave work any time.',
    default: true,
    group: GROUP,
  },
  voice_leave_after_seconds: {
    type: 'number',
    title: 'Leave when no approved person is left (seconds)',
    minimum: 5,
    maximum: 3600,
    default: 60,
    group: GROUP,
  },
  voice_idle_seconds: {
    type: 'number',
    title: 'Stop talking after (seconds)',
    description: 'How long a conversation in a call stays open when nobody says anything.',
    minimum: 10,
    maximum: 600,
    default: 60,
    group: GROUP,
  },
  voice_pause_ms: {
    type: 'number',
    title: 'Conversation end-of-speech pause (ms)',
    description:
      'How long the AI waits after someone stops speaking before it answers in a call. It does not change how speech is written down. 0 lets Gemini decide.',
    minimum: 0,
    maximum: 3000,
    default: DEFAULT_PAUSE_MS,
    group: GROUP,
  },
  voice_transcribe: {
    type: 'enum',
    title: 'Whose speech is written down',
    description:
      'Everyone in the call, or only approved people. Its own voice is never transcribed.',
    options: [
      { value: 'everyone', label: 'Everyone' },
      { value: 'approved', label: 'Approved people' },
    ],
    default: 'everyone',
    group: GROUP,
  },
  voice_wake_sensitivity: {
    type: 'enum',
    title: 'How readily it hears its name',
    description:
      'For the names that wake it in a call. High or highest for quiet voices or names that are hard to catch; highest may wake on similar words.',
    options: WAKE_SENSITIVITIES.map((value) => ({
      value,
      label: `${WAKE_SENSITIVITY_LABELS[value]} · ${WAKE_SENSITIVITY_HINTS[value]}`,
    })),
    default: 'standard',
    group: GROUP,
  },
  voice_retention_days: {
    type: 'number',
    title: 'Days a call transcript is kept',
    minimum: 1,
    maximum: 365,
    default: 30,
    group: GROUP,
  },
  voice_context_minutes: {
    type: 'number',
    title: 'Minutes of call the AI is shown',
    description: 'How much of the call transcript goes with a request from someone in the call.',
    minimum: 1,
    maximum: 120,
    default: 10,
    group: GROUP,
  },
  voice_language: {
    type: 'string',
    title: 'Spoken language',
    description: 'Two letters such as en, to help the transcription. Empty lets it decide.',
    default: '',
    group: GROUP,
  },
};

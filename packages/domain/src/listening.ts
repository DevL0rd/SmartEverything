import { z } from 'zod';
import { TRANSCRIPT_PAUSE_REASONS } from './transcripts';
import { WAKE_SENSITIVITY } from './wake-sensitivity';
import { PAUSE_MS } from './voice-activity';

const MOMENT = z.iso.datetime({ offset: true });

export const SILENCE_DBFS = -120;

const DBFS = z
  .number()
  .min(SILENCE_DBFS)
  .max(0)
  .describe('Loudness in dBFS: 20·log10(rms/32768) of the audio, 0 is full scale');

const PCM = z.base64().describe('16 kHz mono signed 16-bit little-endian audio, base64');

const SPEAKER_PCM = z
  .base64()
  .describe('48 kHz mono signed 16-bit little-endian audio for the speaker, base64');

export const WAKE_CLAIM_SOURCES = ['camera', 'talk', 'voice_call', 'phone', 'computer'] as const;

export type WakeClaimSource = (typeof WAKE_CLAIM_SOURCES)[number];

export const LISTENING_SOURCE_KINDS = ['camera', 'phone', 'computer', 'discord', 'walkie'] as const;

export type ListeningSourceKind = (typeof LISTENING_SOURCE_KINDS)[number];

export const LISTENING_SOURCE_KIND_LABELS: Readonly<Record<ListeningSourceKind, string>> = {
  camera: 'Cameras',
  phone: 'Phones',
  computer: 'Computers',
  discord: 'Discord',
  walkie: 'Walkie channels',
};

export const DISCORD_LISTENING_KEY = 'discord';

export function listeningKeyOf(source: WakeClaimSource, key: string): string {
  return source === 'voice_call' ? DISCORD_LISTENING_KEY : key;
}

export function listeningKindOf(source: WakeClaimSource): ListeningSourceKind {
  switch (source) {
    case 'camera':
    case 'phone':
    case 'computer':
      return source;
    case 'talk':
      return 'walkie';
    case 'voice_call':
      return 'discord';
  }
}

export const WAKE_CLAIM = z.strictObject({
  source: z.enum(WAKE_CLAIM_SOURCES),
  key: z.string().min(1),
  snippetDbfs: DBFS,
});

export type WakeClaim = z.output<typeof WAKE_CLAIM>;

export const WAKE_DECIDERS = ['only', 'loudest', 'computer', 'walkie', 'discord'] as const;

export type WakeDecider = (typeof WAKE_DECIDERS)[number];

export const WAKE_DECIDER_LABELS: Readonly<Record<WakeDecider, string>> = {
  only: 'Only one heard it',
  loudest: 'Loudest',
  computer: 'Computer priority',
  walkie: 'Walkie priority',
  discord: 'Discord call (priority)',
};

export const LISTENING_CLAIM_OUTCOMES = ['won', 'stood_down', 'superseded'] as const;

const CONTESTANT = WAKE_CLAIM.extend({
  afterMs: z.int().min(0).describe('Milliseconds after the first claim of the utterance'),
  outcome: z.enum(LISTENING_CLAIM_OUTCOMES),
});

export const WAKE_ARBITRATED = z.strictObject({
  at: MOMENT,
  winner: WAKE_CLAIM,
  decidedBy: z.enum(WAKE_DECIDERS),
  claims: z.array(CONTESTANT).min(1),
});

export type WakeArbitrated = z.output<typeof WAKE_ARBITRATED>;

export const LISTENING_CLAIM_RECORD = z.strictObject({
  at: MOMENT,
  snippetDbfs: DBFS,
  outcome: z.enum(LISTENING_CLAIM_OUTCOMES),
});

export type ListeningClaimRecord = z.output<typeof LISTENING_CLAIM_RECORD>;

export const LISTENING_RUNTIME_STATES = [
  'in_conversation',
  'discord_call',
  'needs_permission',
  'no_host',
] as const;

export type ListeningRuntimeState = (typeof LISTENING_RUNTIME_STATES)[number];

export const LISTENING_STATES = [
  'listening',
  'off',
  'privacy',
  'offline',
  ...LISTENING_RUNTIME_STATES,
] as const;

export type ListeningState = (typeof LISTENING_STATES)[number];

export const LISTENING_STATE_LABELS: Readonly<Record<ListeningState, string>> = {
  listening: 'Listening',
  off: 'Off',
  privacy: 'Off for privacy',
  offline: 'Offline',
  in_conversation: 'In a conversation',
  discord_call: 'Off during Discord call',
  needs_permission: 'Needs microphone permission',
  no_host: 'Needs a computer to listen',
};

export const LISTENING_WRITING = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('off') }),
  z.strictObject({ state: z.literal('on') }),
  z.strictObject({ state: z.literal('paused'), reason: z.enum(TRANSCRIPT_PAUSE_REASONS) }),
]);

export type ListeningWriting = z.output<typeof LISTENING_WRITING>;

export const LISTENING_STANDARD = { wake: true, transcribe: false } as const;

export const LISTENING_PHONE_STANDARD = { wake: false, transcribe: false } as const;

export const LISTENING_POWER_MODES = ['always', 'screen_on', 'charging', 'away_from_home'] as const;

export const LISTENING_POWER_MODE = z
  .enum(LISTENING_POWER_MODES)
  .describe(
    'When a phone may listen: always, only with the screen on, only charging, or only away',
  );

export type ListeningPowerMode = z.output<typeof LISTENING_POWER_MODE>;

export const DEFAULT_LISTENING_POWER_MODE: ListeningPowerMode = 'always';

export const LISTENING_POWER_MODE_LABELS: Readonly<Record<ListeningPowerMode, string>> = {
  always: 'Always',
  screen_on: 'Only when the screen is on',
  charging: 'Only while charging',
  away_from_home: 'Only away from home',
};

export const LISTENING_SOURCE = z.strictObject({
  key: z.string().min(1).describe('A device id, a walkie channel id, or "discord"'),
  kind: z.enum(LISTENING_SOURCE_KINDS),
  name: z.string().min(1),
  profileId: z.uuid().nullable().describe('The person a phone or computer belongs to'),
  wake: z.boolean().describe('Listens for the AI name said anywhere in a sentence'),
  transcribe: z.boolean().describe('Writes down what it hears'),
  state: z.enum(LISTENING_STATES),
  writing: LISTENING_WRITING,
  sensitivity: WAKE_SENSITIVITY.nullable(),
  power_mode: LISTENING_POWER_MODE.optional().describe('Phones only: when the phone may listen'),
  changeable: z.boolean().describe('Whether the switches can be changed here'),
  claims: z.array(LISTENING_CLAIM_RECORD).describe('The last wake claims from this source'),
});

export type ListeningSource = z.output<typeof LISTENING_SOURCE>;

export const LISTENING_VIEW = z.strictObject({
  sources: z.array(LISTENING_SOURCE),
  last: WAKE_ARBITRATED.nullable().describe('The latest wake contest and who answered'),
});

export type ListeningView = z.output<typeof LISTENING_VIEW>;

export const LISTENING_SOURCE_CHANGE = z
  .strictObject({
    wake: z.boolean().optional(),
    transcribe: z.boolean().optional(),
    sensitivity: WAKE_SENSITIVITY.optional(),
    power_mode: LISTENING_POWER_MODE.optional(),
  })
  .refine((change) => Object.values(change).some((value) => value !== undefined), {
    message: 'Change the wake switch, the write-down switch, the sensitivity or the power mode',
  });

export type ListeningSourceChange = z.output<typeof LISTENING_SOURCE_CHANGE>;

export const LISTENING_LEVEL_WATCH = z.strictObject({
  sourceKey: z.string().min(1).nullable().describe('The source to meter, or null to stop'),
});

export type ListeningLevelWatch = z.output<typeof LISTENING_LEVEL_WATCH>;

export const LISTENING_CHANGED_NOTICE = z.strictObject({ type: z.literal('listening_changed') });

export const LISTENING_LEVEL_NOTICE = z.strictObject({
  type: z.literal('listening_level'),
  sourceKey: z.string().min(1),
  dbfs: DBFS,
});

export type ListeningLevelNotice = z.output<typeof LISTENING_LEVEL_NOTICE>;

export const WAKE_TEST_WATCH = z.strictObject({
  on: z.boolean().describe('Whether this app wants to see what the ears hear right now'),
});

export type WakeTestWatch = z.output<typeof WAKE_TEST_WATCH>;

export const WAKE_TEST_VERDICTS = ['matched', 'almost', 'heard'] as const;

export type WakeTestVerdict = (typeof WAKE_TEST_VERDICTS)[number];

export const WAKE_TEST_LINE = z.strictObject({
  id: z.string().min(1),
  at: MOMENT,
  source: z.string().min(1).describe('The camera, computer or phone that heard it'),
  verdict: z.enum(WAKE_TEST_VERDICTS),
  text: z.string().nullable().describe('What was said, or null when it could not be written down'),
  phrase: z
    .string()
    .min(1)
    .nullable()
    .describe('The wake phrase that fired or came close, when the ear named one'),
});

export type WakeTestLine = z.output<typeof WAKE_TEST_LINE>;

export const WAKE_TEST_NOTICE = z.strictObject({
  type: z.literal('wake_test_heard'),
  line: WAKE_TEST_LINE,
});

export const LISTENING_CONFIG = z.strictObject({
  wake: z.boolean(),
  transcribe: z.boolean(),
  keywords: z.array(z.string().min(1)).describe('The hub’s keyword lines, used byte for byte'),
  threshold: z.number().positive(),
  nearMissThreshold: z.number().positive(),
  sensitivity: WAKE_SENSITIVITY,
  pause_ms: PAUSE_MS.describe('The end-of-speech pause the ear cuts what it writes down by'),
  power_mode: LISTENING_POWER_MODE.optional().describe('Phones only: when the phone may listen'),
});

export type ListeningConfig = z.output<typeof LISTENING_CONFIG>;

export const EAR_SOURCE_KINDS = [
  'camera',
  'talk',
  'voice_call',
] as const satisfies readonly WakeClaimSource[];

export type EarSourceKind = (typeof EAR_SOURCE_KINDS)[number];

export const EAR_KEY = z
  .string()
  .min(1)
  .describe('Names one open ear on the computer that hosts it; the hub keeps it unique');

export const EAR_SOURCE = z.strictObject({
  kind: z.enum(EAR_SOURCE_KINDS),
  key: EAR_KEY,
});

export type EarSource = z.output<typeof EAR_SOURCE>;

export const EAR_CODECS = ['opus_48k_mono', 'opus_48k_stereo'] as const;

export const EAR_CODEC = z
  .enum(EAR_CODECS)
  .describe('How the packets of a relayed ear are encoded: Opus at 48 kHz, mono or stereo');

export type EarCodec = z.output<typeof EAR_CODEC>;

export const EAR_PACKET = z.base64().describe('One Opus packet of a relayed ear, base64');

export const LISTENING_REST_REASONS = ['switched_off', 'discord_call', 'conversation'] as const;

export const LISTENING_SUPERSEDED = z.strictObject({
  winner: z.strictObject({ source: z.enum(WAKE_CLAIM_SOURCES), key: z.string().min(1) }),
});

export type ListeningSuperseded = z.output<typeof LISTENING_SUPERSEDED>;

export const LISTENING_WAKE_CLAIM = z.strictObject({
  phrase: z.string().min(1),
  snippetDbfs: DBFS,
  preroll: PCM,
});

export type ListeningWakeClaim = z.output<typeof LISTENING_WAKE_CLAIM>;

export const LISTENING_SEGMENT = z.strictObject({
  at: MOMENT,
  endedAt: MOMENT,
  levelDbfs: DBFS,
  pcm: PCM,
});

export type ListeningSegment = z.output<typeof LISTENING_SEGMENT>;

const CLAIM_MESSAGE = z.strictObject({ kind: z.literal('claim'), claim: LISTENING_WAKE_CLAIM });

const SEGMENT_MESSAGE = z.strictObject({ kind: z.literal('segment'), segment: LISTENING_SEGMENT });

const LEVEL_MESSAGE = z.strictObject({ kind: z.literal('level'), dbfs: DBFS });

const MIC_MESSAGE = z.strictObject({ kind: z.literal('mic'), pcm: PCM });

const STATE_MESSAGE = z.strictObject({
  kind: z.literal('state'),
  state: z.enum(LISTENING_RUNTIME_STATES).nullable(),
});

const NEAR_MESSAGE = z.strictObject({
  kind: z.literal('near'),
  phrase: z.string().min(1).describe('The wake phrase that scored just under the threshold'),
});

export const LISTENING_NODE_MESSAGE = z.discriminatedUnion('kind', [
  CLAIM_MESSAGE,
  SEGMENT_MESSAGE,
  LEVEL_MESSAGE,
  STATE_MESSAGE,
  MIC_MESSAGE,
  NEAR_MESSAGE,
]);

export const REMOTE_EAR_NODE_MESSAGE = z.discriminatedUnion('kind', [
  CLAIM_MESSAGE,
  SEGMENT_MESSAGE,
  NEAR_MESSAGE,
  STATE_MESSAGE,
]);

export type RemoteEarNodeMessage = z.output<typeof REMOTE_EAR_NODE_MESSAGE>;

export const LISTENING_PHONE_REPORT = z.discriminatedUnion('kind', [
  SEGMENT_MESSAGE,
  LEVEL_MESSAGE,
  STATE_MESSAGE,
]);

export type ListeningPhoneReport = z.output<typeof LISTENING_PHONE_REPORT>;

export const LISTENING_CLAIM_ANSWER = z.strictObject({
  granted: z
    .boolean()
    .describe('Whether this device answers the wake; false when another heard it first or louder'),
});

export type ListeningClaimAnswer = z.output<typeof LISTENING_CLAIM_ANSWER>;

export type ListeningNodeMessage = z.output<typeof LISTENING_NODE_MESSAGE>;

const CONFIG_MESSAGE = z.strictObject({ kind: z.literal('config'), config: LISTENING_CONFIG });

const REST_MESSAGE = z.strictObject({
  kind: z.literal('rest'),
  reason: z.enum(LISTENING_REST_REASONS),
});

const SUPERSEDED_MESSAGE = z.strictObject({
  kind: z.literal('superseded'),
  superseded: LISTENING_SUPERSEDED,
});

export const LISTENING_HUB_MESSAGE = z.discriminatedUnion('kind', [
  CONFIG_MESSAGE,
  REST_MESSAGE,
  SUPERSEDED_MESSAGE,
  z.strictObject({ kind: z.literal('level'), watched: z.boolean() }),
  z.strictObject({ kind: z.literal('call'), active: z.boolean() }),
  z.strictObject({ kind: z.literal('speak'), pcm: SPEAKER_PCM }),
]);

export type ListeningHubMessage = z.output<typeof LISTENING_HUB_MESSAGE>;

export const REMOTE_EAR_HUB_MESSAGE = z.discriminatedUnion('kind', [
  CONFIG_MESSAGE,
  REST_MESSAGE,
  SUPERSEDED_MESSAGE,
]);

export type RemoteEarHubMessage = z.output<typeof REMOTE_EAR_HUB_MESSAGE>;

export const LISTENING_EAR_NOTICE = z.strictObject({
  type: z.literal('listening_ear'),
  message: LISTENING_HUB_MESSAGE,
});

export type ListeningEarNotice = z.output<typeof LISTENING_EAR_NOTICE>;

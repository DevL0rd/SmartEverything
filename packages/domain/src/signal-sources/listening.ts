import {
  LISTENING_SOURCE_KINDS,
  LISTENING_SOURCE_KIND_LABELS,
  WAKE_CLAIM_SOURCES,
  WAKE_DECIDERS,
  WAKE_DECIDER_LABELS,
  type ListeningSource,
} from '../listening';
import type { TranscriptPauseReason } from '../transcripts';
import type { SignalSourceSpec } from './spec';

export const LISTENING_SIGNAL_STATES = [
  'on',
  'off',
  'paused',
  'budget_used_up',
  'mic_permission_lost',
  'no_host',
  'offline',
] as const;

export type ListeningSignalStateName = (typeof LISTENING_SIGNAL_STATES)[number];

export const LISTENING_PAUSE_REASONS = [
  'privacy',
  'in_call',
  'discord_call',
  'no_openrouter_key',
] as const;

export type ListeningPauseReason = (typeof LISTENING_PAUSE_REASONS)[number];

export interface ListeningSignalState {
  readonly state: ListeningSignalStateName;
  readonly reason: ListeningPauseReason | null;
}

const ON: ListeningSignalState = { state: 'on', reason: null };

const WRITING_PAUSE: Readonly<Record<TranscriptPauseReason, ListeningSignalState>> = {
  no_openrouter_key: { state: 'paused', reason: 'no_openrouter_key' },
  cap_reached: { state: 'budget_used_up', reason: null },
  privacy: { state: 'paused', reason: 'privacy' },
  offline: { state: 'offline', reason: null },
  in_call: { state: 'paused', reason: 'in_call' },
};

export function listeningSignalState(
  source: Pick<ListeningSource, 'state' | 'writing'>,
): ListeningSignalState {
  switch (source.state) {
    case 'off':
      return { state: 'off', reason: null };
    case 'offline':
      return { state: 'offline', reason: null };
    case 'privacy':
      return { state: 'paused', reason: 'privacy' };
    case 'in_conversation':
      return { state: 'paused', reason: 'in_call' };
    case 'discord_call':
      return { state: 'paused', reason: 'discord_call' };
    case 'needs_permission':
      return { state: 'mic_permission_lost', reason: null };
    case 'no_host':
      return { state: 'no_host', reason: null };
    case 'listening':
      return source.writing.state === 'paused' ? WRITING_PAUSE[source.writing.reason] : ON;
  }
}

export function listeningSignalValue(state: ListeningSignalState): string {
  return state.reason === null ? state.state : `${state.state}:${state.reason}`;
}

export function sameListeningSignalState(
  left: ListeningSignalState,
  right: ListeningSignalState,
): boolean {
  return left.state === right.state && left.reason === right.reason;
}

export const LISTENING_SIGNALS: SignalSourceSpec = {
  source: 'listening',
  label: 'Listening and wake',
  kinds: [
    {
      kind: 'wake_heard',
      label: 'The AI’s name is heard',
      subject: 'device',
      fields: [],
      match: [
        {
          key: 'source',
          label: 'What heard it',
          values: WAKE_CLAIM_SOURCES,
          valueLabels: {
            camera: 'A camera',
            talk: 'A walkie channel',
            voice_call: 'A Discord call',
            phone: 'A phone',
            computer: 'A computer',
          },
        },
        {
          key: 'winner',
          label: 'The camera, phone, computer or channel that answered',
          values: null,
        },
        {
          key: 'decidedBy',
          label: 'Why it answered',
          values: WAKE_DECIDERS,
          valueLabels: WAKE_DECIDER_LABELS,
        },
      ],
      pulse: true,
      feed: true,
      ownerOnly: true,
    },
    {
      kind: 'state',
      label: 'A microphone’s listening state changes',
      subject: 'device',
      fields: [],
      match: [
        {
          key: 'state',
          label: 'The listening state',
          values: LISTENING_SIGNAL_STATES,
          valueLabels: {
            on: 'Listening',
            off: 'Off',
            paused: 'Paused',
            budget_used_up: 'Today’s transcript budget is used up',
            mic_permission_lost: 'Microphone permission was lost',
            no_host: 'No computer is left to listen',
            offline: 'Offline',
          },
        },
        {
          key: 'source',
          label: 'What listens',
          values: LISTENING_SOURCE_KINDS,
          valueLabels: LISTENING_SOURCE_KIND_LABELS,
        },
        {
          key: 'reason',
          label: 'Why listening is paused',
          values: LISTENING_PAUSE_REASONS,
          valueLabels: {
            privacy: 'Privacy mode is on',
            in_call: 'A conversation is using the microphone',
            discord_call: 'A Discord call is on',
            no_openrouter_key: 'No OpenRouter key is set',
          },
        },
      ],
      pulse: false,
      feed: true,
    },
  ],
};

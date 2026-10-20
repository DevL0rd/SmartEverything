import { CALL_ENDINGS, CALL_SOURCES } from '../assistant-voice';
import { OUTREACH_HOWS } from '../reach';
import type { SignalSourceSpec } from './spec';

export const CALL_SIGNAL_SOURCES = [...CALL_SOURCES, 'hosted'] as const;

export type CallSignalSource = (typeof CALL_SIGNAL_SOURCES)[number];

export const CALL_OUTREACH_STATES = [
  'ringing',
  'answered',
  'declined',
  'missed',
  'failed',
  'sent',
] as const;

export type CallOutreachState = (typeof CALL_OUTREACH_STATES)[number];

export const CALL_SIGNALS: SignalSourceSpec = {
  source: 'call',
  label: 'Calls with the AI',
  kinds: [
    {
      kind: 'started',
      label: 'A call with the AI starts',
      subject: 'profile',
      fields: [],
      match: [
        {
          key: 'source',
          label: 'How the call started',
          values: CALL_SIGNAL_SOURCES,
          valueLabels: {
            chat: 'From the chat',
            orb: 'From the orb',
            palette: 'From the command palette',
            assist: 'From the assist gesture',
            assistant: 'From the assistant button',
            shortcut: 'From the keyboard shortcut',
            hosted: 'On a camera, computer or Discord',
          },
        },
        { key: 'person', label: 'The person', values: null },
        { key: 'device', label: 'The device or place', values: null },
      ],
      pulse: true,
      feed: true,
      urgent: true,
    },
    {
      kind: 'ended',
      label: 'A call with the AI ends',
      subject: 'profile',
      fields: [],
      match: [
        {
          key: 'ending',
          label: 'How it ended',
          values: CALL_ENDINGS,
          valueLabels: {
            hung_up: 'Someone hung up',
            finished: 'The AI finished',
            idle: 'Nobody spoke for a while',
            failed: 'It failed',
            replaced: 'Another call replaced it',
            disconnected: 'The connection dropped',
          },
        },
        { key: 'source', label: 'How the call started', values: CALL_SIGNAL_SOURCES },
        { key: 'person', label: 'The person', values: null },
        { key: 'device', label: 'The device or place', values: null },
      ],
      pulse: true,
      feed: true,
    },
    {
      kind: 'outreach',
      label: 'The AI reaches out to someone',
      subject: 'profile',
      fields: [],
      match: [
        {
          key: 'state',
          label: 'What happened',
          values: CALL_OUTREACH_STATES,
          valueLabels: {
            ringing: 'It starts ringing',
            answered: 'It is answered',
            declined: 'It is declined',
            missed: 'It is missed',
            failed: 'It could not reach anyone',
            sent: 'The message is sent',
          },
        },
        {
          key: 'how',
          label: 'How it reaches out',
          values: OUTREACH_HOWS,
          valueLabels: {
            phone: 'Rings a phone',
            desktop: 'Rings a computer',
            app: 'Rings the app',
            camera: 'Speaks on a camera',
            channel: 'Speaks on a walkie channel',
            message: 'Sends a message',
          },
        },
        { key: 'target', label: 'Who or what it reaches', values: null },
      ],
      pulse: true,
      feed: true,
      urgent: true,
    },
  ],
};

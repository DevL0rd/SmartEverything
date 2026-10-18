import { z } from 'zod';
import { AI_SPEECH_FETCH_SECONDS, OUTREACH_RING_SECONDS } from './reach';

export const PUSH_COMMANDS = [
  'phone_action',
  'machine_approval',
  'machine_approval_cancel',
  'watch_action',
  'ai_speech',
  'ai_ring',
  'ai_ring_cancel',
] as const;

export type PushCommand = (typeof PUSH_COMMANDS)[number];

export const PUSH_COMMAND = z.enum(PUSH_COMMANDS);

export const PUSH_COMMAND_KEY = 'command';

export const PUSH_PAYLOAD_KEY = 'payload';

export const PUSH_ACTION_ANSWER_SECONDS = 25;

const PUSH_CANCEL_TTL_SECONDS = 60;

export const MACHINE_APPROVAL_SECONDS = 60;

export const PUSH_COMMAND_TTL_SECONDS: Readonly<Record<PushCommand, number>> = {
  phone_action: PUSH_ACTION_ANSWER_SECONDS,
  machine_approval: MACHINE_APPROVAL_SECONDS,
  machine_approval_cancel: PUSH_CANCEL_TTL_SECONDS,
  watch_action: PUSH_ACTION_ANSWER_SECONDS,
  ai_speech: AI_SPEECH_FETCH_SECONDS,
  ai_ring: OUTREACH_RING_SECONDS,
  ai_ring_cancel: PUSH_CANCEL_TTL_SECONDS,
};

export const PUSH_COMMANDS_OVER_LIVE: readonly PushCommand[] = [
  'phone_action',
  'machine_approval',
  'machine_approval_cancel',
  'watch_action',
];


import { HUB_FRAME, LISTENING_CONFIG, REMOTE_EAR_NODE_MESSAGE } from '@smarteverything/domain';
import { LOG_LEVELS } from '@smarteverything/logging';
import { z } from 'zod';

export const EAR_CALL = {
  init: 'init',
  ping: 'ping',
  portStop: 'port_stop',
  localOpen: 'local_open',
  localClose: 'local_close',
} as const;

export const EAR_COMMAND = {
  frame: 'frame',
  localAudio: 'local_audio',
} as const;

export const EAR_EVENT = {
  send: 'send',
  scored: 'scored',
  scoreFailed: 'score_failed',
  localClaim: 'local_claim',
  localSegment: 'local_segment',
  localFailed: 'local_failed',
  lost: 'lost',
  log: 'log',
} as const;

const PORT = z.int().nonnegative();
const ID = z.int().nonnegative();
const PCM = z.custom<Int16Array>((value) => value instanceof Int16Array, 'Expected an Int16Array');

export const INIT_INPUT = z.strictObject({
  wakeDiagnosticsDirectory: z.string().min(1).nullable(),
  logPath: z.string().min(1),
  level: z.enum(LOG_LEVELS),
  release: z.string().min(1),
});

export const PORT_INPUT = z.strictObject({ port: PORT });

export const FRAME_INPUT = z.strictObject({ port: PORT, frame: HUB_FRAME });

export const LOCAL_OPEN_INPUT = z.strictObject({ id: ID, config: LISTENING_CONFIG });

export const LOCAL_CLOSE_INPUT = z.strictObject({ id: ID });

export const LOCAL_AUDIO_INPUT = z.strictObject({ id: ID, pcm: PCM });

export const SEND_EVENT = z.strictObject({
  port: PORT,
  key: z.string().min(1),
  message: REMOTE_EAR_NODE_MESSAGE,
});

export const SCORED_EVENT = z.strictObject({
  port: PORT,
  id: z.string().min(1),
  heard: z.boolean(),
});

export const SCORE_FAILED_EVENT = z.strictObject({
  port: PORT,
  id: z.string().min(1),
  reason: z.string().min(1),
});

export const LOCAL_CLAIM_EVENT = z.strictObject({
  id: ID,
  phrase: z.string().min(1),
  snippetDbfs: z.number(),
  words: PCM,
});

export const LOCAL_SEGMENT_EVENT = z.strictObject({
  id: ID,
  startedAt: z.number(),
  endedAt: z.number(),
  pcm: PCM,
});

export const LOCAL_FAILED_EVENT = z.strictObject({ id: ID, reason: z.string().min(1) });

export const LOST_EVENT = z.strictObject({ reason: z.string().min(1) });

export const LOG_EVENT = z.strictObject({
  level: z.enum(LOG_LEVELS),
  scope: z.string().min(1),
  event: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  failure: z
    .strictObject({
      name: z.string(),
      message: z.string(),
      stack: z.string().optional(),
    })
    .optional(),
});

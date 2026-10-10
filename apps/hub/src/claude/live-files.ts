import { CLAUDE_LIVE_STATES } from '@smarteverything/domain';
import { z } from 'zod';
import { EPOCH_MS, knownOrUnknown } from './tolerant';

export const LIVE_FILE_NAME = /^\d+\.json$/;

const SESSION_KINDS = ['interactive', 'bg', 'daemon', 'daemon-worker'] as const;

export const LIVE_FILE = z.object({
  pid: z.int().positive(),
  procStart: z.string().min(1).optional(),
  sessionId: z.string().min(1).optional(),
  hostSessionId: z.string().min(1).optional(),
  cwd: z.string().optional(),
  name: z.string().optional(),
  entrypoint: z.string().optional(),
  version: z.string().optional(),
  kind: knownOrUnknown(SESSION_KINDS).optional(),
  status: knownOrUnknown(CLAUDE_LIVE_STATES).optional(),
  pidDomain: z.string().optional(),
  messagingSocketPath: z.string().min(1).optional(),
  startedAt: EPOCH_MS.optional(),
  updatedAt: EPOCH_MS.optional(),
  statusUpdatedAt: EPOCH_MS.optional(),
});

export type LiveFile = z.output<typeof LIVE_FILE>;

import { z } from 'zod';
import { EPOCH_MS, knownOrUnknown } from './tolerant';
import { CLAUDE_SETTABLE_MODES } from '@smarteverything/domain';

export const INDEX_FILE_NAME = /^[^/\\]+[/\\][^/\\]+[/\\]local_[A-Za-z0-9_-]+\.json$/;

export const INDEX_FILE = z.object({
  sessionId: z.string().min(1),
  cliSessionId: z.string().min(1).optional(),
  cwd: z.string().optional(),
  originCwd: z.string().optional(),
  title: z.string().optional(),
  model: z.string().optional(),
  isArchived: z.boolean().optional(),
  permissionMode: knownOrUnknown(CLAUDE_SETTABLE_MODES).optional(),
  createdAt: EPOCH_MS.optional(),
  lastActivityAt: EPOCH_MS.optional(),
});

export type IndexFile = z.output<typeof INDEX_FILE>;

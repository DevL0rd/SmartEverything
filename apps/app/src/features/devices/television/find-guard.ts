import type { API_ENDPOINTS } from '@smarteverything/domain';
import type { z } from 'zod';
import type { LinkStage } from '../../connections';

export type FindReply = z.infer<typeof API_ENDPOINTS.findTelevision.response>;

export const RETRY_AFTER_MS = 60_000;

export interface FindMemory {
  readonly attempted: boolean;
  readonly failedAt: number | null;
}

export const NEVER_TRIED: FindMemory = { attempted: false, failedAt: null };

export function mayFind(input: {
  readonly linked: boolean;
  readonly running: boolean;
  readonly memory: FindMemory;
  readonly now: number;
}): boolean {
  const { linked, running, memory, now } = input;
  if (linked || running) {
    return false;
  }
  if (!memory.attempted) {
    return true;
  }
  return memory.failedAt !== null && now - memory.failedAt > RETRY_AFTER_MS;
}

function afterReply(reply: FindReply, stage: LinkStage): string {
  if (reply.outcome === 'not_found') {
    return reply.message;
  }
  return stage.kind === 'failed'
    ? 'The TV did not finish linking. Use Link directly in its settings to try again.'
    : 'Allow on the TV to finish linking';
}

export function findLine(input: {
  readonly linked: boolean;
  readonly running: boolean;
  readonly reply: FindReply | null;
  readonly stage: LinkStage;
  readonly tried: boolean;
}): string | null {
  const { linked, running, reply, stage, tried } = input;
  if (linked) {
    return tried ? 'Linked' : null;
  }
  if (running) {
    return 'Looking for your TV on the network';
  }
  return reply === null ? null : afterReply(reply, stage);
}

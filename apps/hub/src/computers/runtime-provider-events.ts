import type { ComputerRuntimeTarget } from '@smarteverything/domain';
import { z } from 'zod';
import type { AttachedRuntime, RuntimeJob } from './runtime-directory-types';
import type { ComputerRuntimeHostEvent } from './runtime-host';
import type { RuntimeReceipts } from './runtime-receipts';
export function runtimeProviderProfile(
  jobs: ReadonlyMap<string, RuntimeJob>,
  target: ComputerRuntimeTarget,
  event: Extract<ComputerRuntimeHostEvent, { kind: 'provider' }>,
  source: AttachedRuntime,
): string | null {
  const job = jobs.get(JSON.stringify([target.device_id, target.runtime, event.event.job_id]));
  if (job?.source !== source || job.chatId !== event.event.chat_id || event.event.seq <= job.seq)
    return null;
  const generation = providerGeneration(event);
  if (generation !== null) {
    if (job.processGeneration !== null && job.processGeneration !== generation) return null;
    job.processGeneration = generation;
  }
  job.seq = event.event.seq;
  return job.profileId;
}

export function nativeRuntimeProfile(
  receipts: RuntimeReceipts<AttachedRuntime>,
  target: ComputerRuntimeTarget,
  event: ComputerRuntimeHostEvent,
  source: AttachedRuntime,
): string | null | undefined {
  if (event.kind !== 'native') return undefined;
  if (event.runtime === 'claude' && event.notice.type === 'claude_operation')
    return receipts.profile(event.notice.operation.id, target, source);
  if (event.runtime === 'codex' && event.notice.type === 'codex_operation')
    return receipts.profile(event.notice.operation, target, source);
  return undefined;
}

function providerGeneration(
  event: Extract<ComputerRuntimeHostEvent, { kind: 'provider' }>,
): string | null {
  if (event.runtime === 'codex') return event.event.process_generation;
  if (event.event.kind !== 'runtime') return null;
  const source = z.object({ _source_generation: z.uuid() }).safeParse(event.event.payload);
  return source.success ? source.data._source_generation : null;
}

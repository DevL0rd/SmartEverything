import { randomUUID } from 'node:crypto';
import {
  ApiError,
  AI_NATIVE_REFERENCE_RESULT,
  type AiNativeReferenceAction,
  type AiHarnessSession,
  type AiNativeReferenceResult,
  type AiReference,
  type AiReferenceKind,
  type AiReferenceSearch,
  type AiReferenceSourceStatus,
} from '@smarteverything/domain';
import type { NativeReferences, NativeSearch, ReferenceContext } from '../references/contracts';
import type { HarnessService } from './service';
import { nativeReferenceSession } from './reference-authority';

const NO_MATCHES = { items: [], incomplete: false } as const;

export function harnessReferences(service: HarnessService): NativeReferences {
  return {
    search: (context, request, kinds) => nativeSearch(service, context, request, kinds),
    admit: async (context, references: readonly AiReference[]): Promise<void> => {
      await execute(service, context, { action: 'resolve', references: [...references] });
    },
  };
}

async function nativeSearch(
  service: HarnessService,
  context: ReferenceContext,
  request: AiReferenceSearch,
  kinds: readonly AiReferenceKind[],
): Promise<NativeSearch> {
  const session = openSession(service, context);
  if (session instanceof ApiError)
    return {
      sources: kinds.map((kind) => ({ kind, state: 'unavailable', reason: session.message })),
      matches: NO_MATCHES,
    };
  const sources = kinds.map((kind): AiReferenceSourceStatus => {
    if (kind === 'device_path' && session.target.kind !== 'device')
      return {
        kind,
        state: 'unavailable',
        reason: 'Device references use the primary indexed folder of a selected computer.',
      };
    return { kind, state: 'available' };
  });
  const searched = searchedKinds(request, sources);
  if (searched.length === 0) return { sources, matches: NO_MATCHES };
  const page = await executeIn(service, session, {
    action: 'search',
    search: { ...request, kinds: searched },
  });
  if (page.next_cursor !== null)
    await executeIn(service, session, { action: 'close', cursor: page.next_cursor });
  return { sources, matches: { items: page.items, incomplete: page.incomplete } };
}

function openSession(
  service: HarnessService,
  context: ReferenceContext,
): AiHarnessSession | ApiError {
  try {
    return nativeReferenceSession(service, context);
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
}

function searchedKinds(
  request: AiReferenceSearch,
  sources: readonly AiReferenceSourceStatus[],
): AiReferenceKind[] {
  if (request.directory !== undefined) return [];
  const available = sources.filter((source) => source.state === 'available');
  const container = request.container;
  return available
    .map((source) => source.kind)
    .filter(
      (kind) =>
        container === undefined || (kind === 'device_path' && container.kind === 'device_path'),
    );
}

function execute(
  service: HarnessService,
  context: ReferenceContext,
  input: AiNativeReferenceAction,
): Promise<AiNativeReferenceResult> {
  return executeIn(service, nativeReferenceSession(service, context), input);
}

async function executeIn(
  service: HarnessService,
  state: AiHarnessSession,
  input: AiNativeReferenceAction,
): Promise<AiNativeReferenceResult> {
  if (state.epoch === null)
    throw new ApiError('conflict', 'Native reference writer epoch is absent.');
  const receipt = await service.directory.execute(state.target, randomUUID(), {
    kind: 'reference',
    session_id: state.session_id,
    expected_epoch: state.epoch,
    input,
  });
  if (receipt.state !== 'completed' || receipt.references === undefined)
    throw new ApiError('conflict', 'Native reference receipt is incomplete.');
  return AI_NATIVE_REFERENCE_RESULT.parse(receipt.references);
}

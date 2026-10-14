import { ApiError } from '@smarteverything/domain';
import type {
  AiReferenceKind,
  AiReferenceSourceStatus,
  AiReferenceSearch,
} from '@smarteverything/domain';
import type {
  ReferenceContext,
  ReferenceSource,
  ReferenceSearchProgress,
} from '../references/contracts';
import { emptyReferenceSearch } from '../references/contracts';
import type { HarnessService } from './service';
import { nativeReferenceSession } from './reference-authority';
import { storedProjectBinding } from './project-grant';
import { resolveRuntimeReference, type NativeReferenceOperation } from './reference-runtime';

export function nativeReferenceSource(
  service: HarnessService,
  kind: AiReferenceKind,
  execute: NativeReferenceOperation,
): ReferenceSource {
  return {
    kind,
    status: (context) => nativeSourceStatus(service, context, kind),
    open: (context, search) => openNativeSource(kind, execute, context, search),
    resolve: (context, reference) => resolveRuntimeReference(execute, context, reference),
  };
}
function nativeSourceStatus(
  service: HarnessService,
  context: ReferenceContext,
  kind: AiReferenceKind,
): AiReferenceSourceStatus {
  try {
    const session = nativeReferenceSession(service, context);
    if (
      kind === 'device_path' &&
      storedProjectBinding(service.store, session.session_id)?.kind !== 'device'
    )
      return {
        kind,
        state: 'unavailable',
        reason: 'Select an explicit device workspace to reference its files and folders.',
      };
    return { kind, state: 'available' };
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return { kind, state: 'unavailable', reason: error.message };
  }
}
function openNativeSource(
  kind: AiReferenceKind,
  execute: NativeReferenceOperation,
  context: ReferenceContext,
  search: AiReferenceSearch,
): Promise<ReferenceSearchProgress> {
  if (
    search.directory !== undefined ||
    (search.container !== undefined &&
      (kind !== 'device_path' || search.container.kind !== 'device_path'))
  )
    return Promise.resolve(emptyReferenceSearch());
  let cursor: string | null = null;
  let revision: string | undefined;
  let closed = false;
  return Promise.resolve({
    next: async (current, limit): Promise<ReferencePage> => {
      if (closed) throw new ApiError('conflict', 'Native reference search is closed.');
      const page = await execute(current, {
        action: 'search',
        search: { ...search, limit, kinds: [kind], ...(cursor === null ? {} : { cursor }) },
      });
      cursor = page.next_cursor;
      if (revision !== undefined && revision !== page.revision)
        throw new ApiError('conflict', 'Native reference catalogue revision changed.');
      revision = page.revision;
      return { items: page.items, complete: cursor === null, incomplete: page.incomplete };
    },
    close: async (): Promise<void> => {
      closed = true;
      if (cursor !== null) {
        const retained = cursor;
        cursor = null;
        await execute(context, { action: 'close', cursor: retained });
      }
    },
  });
}

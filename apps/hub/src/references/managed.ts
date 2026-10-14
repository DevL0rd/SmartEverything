import { Context } from '@deepseek-ai/cordis';
import { HarnessLocalFileSystem } from '@smarteverything/harness';
import { AI_PROJECT_CHUNK_BYTES, ApiError, type AiReference } from '@smarteverything/domain';
import { ProjectPaths } from '../projects/paths';
import { projectStat } from '../projects/reads';
import type { Store } from '../store/store';
import type { ReferenceContext, ReferenceSource, ReferenceSearchProgress } from './contracts';
import { ManagedReferenceScan } from './managed-scan';
import { emptyReferenceSearch } from './contracts';

export function managedReferenceSource(store: Store, dataDirectory: string): ReferenceSource {
  const paths = new ProjectPaths(store, dataDirectory);
  return {
    kind: 'managed_path',
    status: () => ({ kind: 'managed_path', state: 'available' }),
    open: async (context, request): Promise<ReferenceSearchProgress> => {
      const container = request.container;
      if (container?.kind === 'device_path') return emptyReferenceSearch();
      if (container !== undefined) {
        if (container.chat_id !== context.chat.id)
          throw new ApiError(
            'forbidden',
            'Directory search must remain in this chat’s managed project.',
          );
        await resolveManaged(paths, store, context, container);
      }
      const fs = await projectFilesystem(paths, context);
      return new ManagedReferenceScan(paths, fs, context, {
        ...request,
        directory: container?.path ?? request.directory,
      });
    },
    resolve: (context, reference): Promise<AiReference> =>
      resolveManaged(paths, store, context, reference),
  };
}
async function projectFilesystem(
  paths: ProjectPaths,
  context: ReferenceContext,
): Promise<HarnessLocalFileSystem> {
  const root = await paths.ensure(context.chat.id, context.authority.profileId, context.validate);
  context.validate();
  return new HarnessLocalFileSystem(new Context(), {
    cwd: root,
    diffBasisMaxBytes: AI_PROJECT_CHUNK_BYTES,
  });
}
function requireManagedVersion(
  file: Awaited<ReturnType<typeof projectStat>>,
  reference: Extract<AiReference, { kind: 'managed_path' }>,
): void {
  if (file?.version !== reference.version || file.type !== reference.entry_kind)
    throw new ApiError(
      'conflict',
      'The referenced managed path changed or is no longer available.',
    );
}

async function resolveManaged(
  paths: ProjectPaths,
  store: Store,
  context: ReferenceContext,
  reference: AiReference,
): Promise<AiReference> {
  context.validate();
  if (reference.kind !== 'managed_path')
    throw new ApiError('invalid_request', 'Expected a managed project reference.');
  if (reference.chat_id !== context.chat.id)
    throw new ApiError(
      'forbidden',
      'Managed references cannot leave their initiating chat project.',
    );
  if (store.aiChats.chat(reference.chat_id).profile_id !== context.authority.profileId)
    throw new ApiError('forbidden', 'The referenced project belongs to a different profile.');
  store.aiChats.assertWorkAllowed(reference.chat_id);
  if (reference.path.split('/').includes('.operations'))
    throw new ApiError('forbidden', 'Operation receipts cannot be referenced.');
  const fs = new HarnessLocalFileSystem(new Context(), {
    cwd: paths.root(reference.chat_id),
    diffBasisMaxBytes: AI_PROJECT_CHUNK_BYTES,
  });
  const file = await projectStat(paths, fs, reference.chat_id, reference.path);
  requireManagedVersion(file, reference);
  store.aiChats.assertWorkAllowed(reference.chat_id);
  context.validate();
  return reference;
}

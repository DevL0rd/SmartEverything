import { createHash, randomUUID } from 'node:crypto';
import {
  ApiError,
  AI_HTML_PREVIEW_PUBLICATION,
  AI_PREVIEW_HTML_MAX,
  type AiHtmlPreviewPublication,
} from '@smarteverything/domain';
import type { Store } from '../store/store';
import type { Caller } from '../server/auth';
import { projectCallerAuthority } from '../projects/authority';
import type { ProjectFilesService } from '../projects/service';
import { legacyHtmlSessions } from './legacy-sessions';
import { projectHtml } from './project-content';
import {
  successfulLegacyHtml,
  type LegacyHtmlRetention,
  type LegacyHtmlRecoveryScope,
} from './legacy-evidence';
import { recoverLatestLegacyHtml, canonicalRevocationEvidence } from './legacy-recovery';
export type { LegacyHtmlRetention, LegacyHtmlRecoveryScope } from './legacy-evidence';
export function inventoryLegacyHtml(
  store: Store,
  caller: Caller,
  chat: string,
  scope: readonly AiHtmlPreviewPublication[] | LegacyHtmlRecoveryScope,
): readonly LegacyHtmlRetention[] {
  if ('mode' in scope) return recoverLatestLegacyHtml(store, caller, chat, scope);
  const admitted = scope;
  const authority = projectCallerAuthority(store, caller, chat);
  const sessions = legacyHtmlSessions(store, chat, authority.profileId);
  const records: LegacyHtmlRetention[] = [];
  for (const session of sessions) {
    for (const view of admitted) {
      if (
        view.chat_id !== chat ||
        view.profile_id !== authority.profileId ||
        view.file_source !== undefined ||
        view.project_source !== undefined
      )
        continue;
      const record = successfulLegacyHtml(session.events, view, session.id);
      if (record !== undefined) records.push(record);
    }
  }
  authority.validate(false);
  return records;
}
function canonicalRetention(
  store: Store,
  caller: Caller,
  record: LegacyHtmlRetention,
): LegacyHtmlRetention {
  const view = AI_HTML_PREVIEW_PUBLICATION.parse(record.view);
  const authority = projectCallerAuthority(store, caller, view.chat_id);
  if (
    authority.profileId !== view.profile_id ||
    view.file_source !== undefined ||
    view.project_source !== undefined
  )
    throw new ApiError(
      'forbidden',
      'Only an admitted standalone HTML document can be centrally retained.',
    );
  const canonical = inventoryLegacyHtml(
    store,
    caller,
    view.chat_id,
    record.recovery ?? [view],
  ).find(
    (candidate) =>
      candidate.sessionId === record.sessionId &&
      candidate.callSeq === record.callSeq &&
      candidate.resultSeq === record.resultSeq &&
      candidate.checksum === record.checksum,
  );
  if (canonical === undefined)
    throw new ApiError(
      'forbidden',
      'Retention has no exact successful canonical call/result evidence.',
    );
  if (
    createHash('sha256').update(record.html).digest('hex') !== record.checksum ||
    Buffer.byteLength(record.html) > AI_PREVIEW_HTML_MAX
  )
    throw new ApiError('conflict', 'The canonical HTML retention checksum or size differs.');
  assertPublicationRestoration(store, canonical);
  return canonical;
}
function assertPublicationRestoration(store: Store, record: LegacyHtmlRetention): void {
  const revocation = canonicalRevocationEvidence(store, record);
  if (revocation === 'revoked' || (revocation === 'incomplete' && record.recovery === undefined))
    throw new ApiError('conflict', 'Canonical revocation prevents restoring this old publication.');
}
export function legacyRetentionRoot(record: LegacyHtmlRetention): string {
  return record.recovery === undefined
    ? `workspace/previews/${record.view.id}`
    : `workspace/recovered-previews/${record.view.id}/${record.view.revision}`;
}
function retainPublicationReference(store: Store, record: LegacyHtmlRetention): void {
  const { view, checksum } = record;
  const previous = store.previewProjects.list().find((row) => row.id === view.id);
  if (previous !== undefined && previous.revision !== view.revision)
    throw new ApiError(
      'conflict',
      'A newer durable publication exists; retention cannot replace its revision.',
    );
  store.durableWrite(() => {
    store.previewProjects.put({
      id: view.id,
      revision: view.revision,
      chat_id: view.chat_id,
      profile_id: view.profile_id,
      title: view.title,
      root: legacyRetentionRoot(record),
      entry: 'index.html',
      standalone: 1,
      checksum,
    });
  });
}
export async function retainLegacyHtml(
  store: Store,
  projects: ProjectFilesService,
  caller: Caller,
  input: LegacyHtmlRetention,
): Promise<void> {
  const record = canonicalRetention(store, caller, input);
  const { view, checksum } = record;
  const authority = projectCallerAuthority(store, caller, view.chat_id);
  const root = legacyRetentionRoot(record);
  const source = { root, entry: 'index.html', standalone: true };
  const path = `${source.root}/${source.entry}`;
  const stat = await projects.execute(authority, { operation: 'stat', path });
  if (stat.file === null)
    await projects.execute(authority, {
      operation: 'write',
      path,
      version: null,
      operation_id: randomUUID(),
      content: record.html,
      encoding: 'utf8',
    });
  const disk = await projectHtml(projects, authority, source);
  if (createHash('sha256').update(disk).digest('hex') !== checksum)
    throw new ApiError(
      'conflict',
      'Existing central HTML differs; retention never overwrites newer files.',
    );
  canonicalRetention(store, caller, record);
  authority.validate(true);
  if (record.recovery !== undefined) return;
  retainPublicationReference(store, record);
}

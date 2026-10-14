import type { QueryClient } from '@tanstack/react-query';
import type { AiPreviewNotice } from '@smarteverything/domain';
import { ValueStore } from '../design/external-store';
const MAX_REMEMBERED_NOTICES = 512;
const seenNotices = new Map<string, string>();
export const PREVIEW_KEY = ['window', 'ai-previews'] as const;
export const previewNotices = new ValueStore<AiPreviewNotice | null>(null);
export const previewRevisions = new ValueStore<ReadonlyMap<string, number>>(new Map());
export function receivePreviewNotice(client: QueryClient, message: AiPreviewNotice): void {
  const identity = JSON.stringify([
    message.chat_id,
    message.profile_id,
    message.state,
    message.revision,
    message.content_changed,
  ]);
  if (seenNotices.get(message.publication_id) === identity) return;
  seenNotices.set(message.publication_id, identity);
  if (seenNotices.size > MAX_REMEMBERED_NOTICES) {
    const oldest = seenNotices.keys().next().value;
    if (oldest !== undefined) seenNotices.delete(oldest);
  }
  const revisions = previewRevisions.get();
  previewRevisions.set(
    new Map([
      ...revisions,
      [message.publication_id, (revisions.get(message.publication_id) ?? 0) + 1],
    ]),
  );
  previewNotices.set(message);
  void client.invalidateQueries({ queryKey: PREVIEW_KEY });
}

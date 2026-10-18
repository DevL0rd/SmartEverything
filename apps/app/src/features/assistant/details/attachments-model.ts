import type { AssistantAttachment, AssistantMessageRow } from '@smarteverything/domain';
import { compareText } from '../../../format/text';

export interface AttachedFile {
  readonly attachment: AssistantAttachment;
  readonly at: string;
}

type Row = Pick<AssistantMessageRow, 'created_at' | 'attachments'>;

export function attachedFilesOf(rows: readonly Row[]): readonly AttachedFile[] {
  const seen = new Set<string>();
  return [...rows]
    .sort((left, right) => compareText(right.created_at, left.created_at))
    .flatMap((row) => row.attachments.map((attachment) => ({ attachment, at: row.created_at })))
    .filter(({ attachment }) => {
      if (seen.has(attachment.id)) return false;
      seen.add(attachment.id);
      return true;
    });
}

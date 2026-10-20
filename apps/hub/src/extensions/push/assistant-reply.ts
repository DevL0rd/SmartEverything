import type { AssistantMessageRow, RowChange } from '@smarteverything/domain';

const ASSISTANT_BODY_MAX = 180;

export function assistantBody(row: AssistantMessageRow): string {
  if (row.text !== '') {
    return row.text.length > ASSISTANT_BODY_MAX
      ? `${row.text.slice(0, ASSISTANT_BODY_MAX - 1)}…`
      : row.text;
  }
  return row.attachments.some((file) => file.mime.startsWith('image/'))
    ? 'Sent a photo'
    : 'Sent a file';
}

export function finishedReply(change: RowChange): AssistantMessageRow | null {
  if (change.table !== 'assistant_messages' || change.record === null) {
    return null;
  }
  const row: AssistantMessageRow = change.record;
  if (row.role !== 'responder' || (row.kind !== 'text' && row.kind !== 'update')) {
    return null;
  }
  return justFinished(change.operation, row, change.oldRecord) ? row : null;
}

function justFinished(
  operation: RowChange['operation'],
  row: AssistantMessageRow,
  old: AssistantMessageRow | null,
): boolean {
  if (operation === 'INSERT') {
    return row.state === null;
  }
  return operation === 'UPDATE' && row.state === 'answered' && old?.state !== 'answered';
}

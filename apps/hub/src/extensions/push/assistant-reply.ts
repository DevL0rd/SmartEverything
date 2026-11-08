import type { AssistantMessageRow, RowChange } from '@smarteverything/domain';
import type { PushNotification } from './fcm';
import type { ReplyExtras } from './reply-notices';

const ASSISTANT_BODY_MAX = 180;

function assistantBody(row: AssistantMessageRow): string {
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

export function replyNotification(
  row: AssistantMessageRow,
  title: string,
  extras: ReplyExtras | undefined,
): PushNotification {
  return {
    title,
    body: assistantBody(row),
    data: {
      kind: 'assistant_reply',
      messageId: row.id,
      chatId: row.chat_id,
      categoryId: 'assistant_reply',
      ...(extras?.link === undefined ? {} : { link: extras.link }),
    },
    dataOnly: extras === undefined,
    ...(extras?.tag === undefined ? {} : { tag: extras.tag }),
    ...(extras?.sound === undefined ? {} : { sound: extras.sound }),
  };
}

import { randomUUID } from 'node:crypto';
import { sniffImage } from '../assistant/image-attachment';
import { ConversationLog } from '../assistant/conversation-log';
import type { StoredAttachment } from '../store/repositories/assistant-chat';
import { pictureFileReader } from '../plugins/picture-file';
import { ReachRefusedError } from '../reach/reach-errors';
import type { Asker } from '../reach/reach-guards';
import type { PersonNotice, ReachAssistant } from '../reach/reach-service';
import type { AssistantService } from '../assistant/service';
import type { ReplyExtras, ReplyNotices } from '../extensions/push/reply-notices';
import type { Store } from '../store/store';

export interface NoticeContext {
  readonly store: Store;
  readonly recordingPath: (storagePath: string) => string;
  readonly assistant: {
    readonly chats: Pick<AssistantService['chats'], 'defaultChat'>;
    readonly files: Pick<AssistantService['files'], 'keepBytes' | 'pathOf'>;
  };
  readonly replyNotices: ReplyNotices;
}

async function pictureOf(
  context: NoticeContext,
  asker: Asker,
  personId: string,
  pictureId: string,
): Promise<StoredAttachment> {
  const file = await pictureFileReader({
    store: context.store,
    recordingPath: context.recordingPath,
    attachmentPath: (file) => context.assistant.files.pathOf(file),
  })(
    {
      profileId: asker.profileId,
      role: asker.role,
      chatId: asker.chatId,
      clientId: asker.clientId,
      via: 'app',
    },
    pictureId,
  );
  if (file === null) {
    throw new ReachRefusedError(
      `There is no picture ${pictureId} you may use; take it from camera_snapshot.`,
    );
  }
  const image = sniffImage(file.data);
  if (image === undefined)
    throw new ReachRefusedError(`The picture ${pictureId} is not a PNG, JPEG or WebP image.`);
  return context.assistant.files.keepBytes({
    authorize: (): void => undefined,
    profileId: personId,
    name: `picture.${image.extension}`,
    mime: image.mime,
    content: file.data,
    signal: new AbortController().signal,
  });
}

function extrasOf(notice: PersonNotice): ReplyExtras {
  const { tag, link, sound } = notice;
  return {
    ...(tag === undefined ? {} : { tag }),
    ...(link === undefined ? {} : { link }),
    ...(sound === undefined ? {} : { sound }),
  };
}

export function noticeMessenger(context: NoticeContext): ReachAssistant['message'] {
  const log = new ConversationLog(context.store);
  return async (asker, personId, notice): Promise<string> => {
    const chat = context.assistant.chats.defaultChat(personId);
    const files =
      notice.image === undefined ? [] : [await pictureOf(context, asker, personId, notice.image)];
    const messageId = randomUUID();
    context.replyNotices.expect(messageId, extrasOf(notice));
    try {
      log.responderInChat({
        chat,
        replyTo: null,
        text: notice.text,
        files,
        kind: 'update',
        messageId,
      });
    } finally {
      context.replyNotices.discard(messageId);
    }
    return chat.id;
  };
}

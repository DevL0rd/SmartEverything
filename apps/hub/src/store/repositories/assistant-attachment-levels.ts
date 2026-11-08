import type { StoreContext } from '../context';
import { jsonText } from '../sql';
import type { AssistantChatRepository } from './assistant-chat';

export function setAttachmentLevels(
  context: StoreContext,
  repository: AssistantChatRepository,
  id: string,
  levels: number[],
): void {
  context.write(() => {
    repository.attachment(id);
    context.sql.run(
      'keep the attachment levels',
      'update assistant_attachments set levels = $levels where id = $id',
      { id, levels: jsonText(levels) },
    );
    const { message_id: messageId } = repository.attachment(id);
    if (messageId === null) return;
    const message = repository.message(messageId);
    repository.updateMessage(message.id, {
      attachments: message.attachments.map((attachment) =>
        attachment.id === id ? { ...attachment, levels } : attachment,
      ),
    });
  });
}

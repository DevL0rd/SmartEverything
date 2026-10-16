import type { AssistantMessageRow } from '@smarteverything/domain';
import type { StoreContext } from '../context';
import type { AssistantChatRepository } from './assistant-chat';
import type { StoredAttachment } from './assistant-files';
import { SpeechRepository } from './speech';

export function setAttachmentTranscript(
  context: StoreContext,
  repository: AssistantChatRepository,
  id: string,
  transcript: string,
): void {
  context.write(() => {
    const file = repository.attachment(id);
    context.sql.run(
      'keep the attachment transcript',
      'update assistant_attachments set transcript = $transcript where id = $id',
      { id, transcript },
    );
    if (file.transcript === null && file.mime.startsWith('audio/') && transcript !== '(no speech)')
      publishSpeech(
        context,
        file,
        transcript,
        file.message_id === null ? null : repository.message(file.message_id),
      );
    if (file.message_id === null) return;
    const message = repository.message(file.message_id);
    repository.updateMessage(message.id, {
      attachments: message.attachments.map((attachment) =>
        attachment.id === id ? { ...attachment, transcript } : attachment,
      ),
    });
  });
}

function publishSpeech(
  context: StoreContext,
  file: StoredAttachment,
  text: string,
  message: AssistantMessageRow | null,
): void {
  context.speech({
    kind: 'attachment',
    commitId: new SpeechRepository(context).nextCommit(),
    attachmentId: file.id,
    chatId: message?.chat_id ?? null,
    profileId: file.profile_id,
    text,
    bot: message?.role === 'responder',
  });
}

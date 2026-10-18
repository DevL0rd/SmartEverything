import { Logger } from '@smarteverything/logging';
import type { AssistantAttachment } from '@smarteverything/domain';
import { assistantAttachmentLinks } from '../../../api/assistant';
import { notify } from '../../../components/toast-store';
import { downloadFile, isPreviewable, previewFile } from '../../../platform/file-actions';

const log = new Logger('app.assistant');
export async function openAttachment(attachment: AssistantAttachment): Promise<void> {
  const operation = log.operation('attachment.open', {
    attachmentId: attachment.id,
    mime: attachment.mime,
    bytes: attachment.bytes,
  });
  try {
    const link = (await assistantAttachmentLinks([attachment.id]))[attachment.id];
    if (link === undefined) {
      throw new Error('No link was issued for this file.');
    }
    if (isPreviewable(attachment.mime)) previewFile(link.url, attachment.name);
    else downloadFile(link.url, attachment.name);
    operation.succeeded({ previewable: isPreviewable(attachment.mime) });
  } catch (error) {
    operation.failed(error);
    notify({ message: `${attachment.name} could not be opened`, error, tone: 'critical' });
  }
}

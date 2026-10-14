import { AI_HARNESS_COMMAND_ATTACHMENT, type AiHarnessCommandWrite } from '@smarteverything/domain';
import { commandUploadData, type Upload } from '../data/uploads';
export async function commandAttachments(
  uploads: readonly Upload[],
): Promise<AiHarnessCommandWrite['attachments']> {
  return Promise.all(
    uploads.map(async (upload) => {
      if (upload.state !== 'done')
        throw new Error('Wait for attachments to finish uploading before running a command.');
      if (!upload.mime.startsWith('image/'))
        throw new Error(
          'This file has no completed native Session receipt. Remove it to run this command.',
        );
      return AI_HARNESS_COMMAND_ATTACHMENT.parse({
        type: 'image',
        mediaType: upload.mime,
        data: await commandUploadData(upload.key),
        name: upload.name,
      });
    }),
  );
}

import type { PluginTool } from '../../contract';
import { WRITE_HINTS } from '../../tool-kit';
import type { DiscordServices } from '../services';
import { UPLOAD_BEGIN, UPLOAD_CHUNK, UPLOAD_ID, uploaderOf } from '../uploads';
import { actionTool, plain, type LocalAction, type LocalOutput } from './action-tool';

function uploadActions(services: DiscordServices): readonly LocalAction[] {
  const { uploads, media, settings } = services;
  return [
    {
      action: 'begin',
      description:
        'For clients that cannot write into the outbox folder: reserve an upload, send its bytes with chunk, check it with seal, then pass { uploadId } in the files of send. Safe file name and MIME; SHA-256 optional.',
      shape: UPLOAD_BEGIN.shape,
      run: (args, caller): Promise<LocalOutput> => {
        const uploader = uploaderOf(caller);
        media.assertEnabled();
        return Promise.resolve(
          plain(uploads.begin(UPLOAD_BEGIN.parse(args), settings.media_max_file_bytes, uploader)),
        );
      },
    },
    {
      action: 'chunk',
      description:
        'Append the next canonical base64 chunk (at most 128 KiB) at the exact byte offset. Identical retries are accepted.',
      shape: UPLOAD_CHUNK.shape,
      run: (args, caller): Promise<LocalOutput> => {
        const uploader = uploaderOf(caller);
        media.assertEnabled();
        return Promise.resolve(plain(uploads.chunk(UPLOAD_CHUNK.parse(args), uploader)));
      },
    },
    {
      action: 'seal',
      description:
        'Check the complete size, SHA-256 if given, format and image dimensions. A sealed upload can be sent with send.',
      shape: UPLOAD_ID.shape,
      run: async (args, caller): Promise<LocalOutput> => {
        const uploader = uploaderOf(caller);
        media.assertEnabled();
        return plain(await uploads.seal(UPLOAD_ID.parse(args).uploadId, uploader));
      },
    },
  ];
}

export function uploadTool(services: DiscordServices): PluginTool {
  return actionTool(services, {
    name: 'upload',
    title: 'Upload a file to send in Discord',
    intro:
      'Hand a file to the plugin in pieces, then send it with the send tool. Uploads last ten minutes.',
    annotations: WRITE_HINTS,
    operations: [],
    local: uploadActions(services),
  });
}

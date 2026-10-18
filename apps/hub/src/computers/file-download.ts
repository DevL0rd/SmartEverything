import {
  ApiError,
  FILE_CHUNK_BYTES,
  FILE_PATH,
  FILE_RANGE,
  type FileRange,
} from '@smarteverything/domain';
import { Readable } from 'node:stream';
import { authenticate } from '../server/auth';
import type { RawRoute } from '../server/http-server';
import { sendBytes } from '../server/recording-files';
import type { Store } from '../store/store';
import { ComputerAccess, guarded, viewerOf } from './computer-access';
import type { ComputerDirectory } from './computer-directory';

const COMPUTER_DOWNLOAD_PATH = '/api/computers/:deviceId/download';

interface Options {
  readonly store: Store;
  readonly directory: ComputerDirectory;
}

export type ChunkOf = (start: number, length: number) => Promise<FileRange>;

export async function* chunks(
  chunkOf: ChunkOf,
  first: number,
  last: number,
): AsyncGenerator<Buffer> {
  for (let at = first; at <= last;) {
    const part = Buffer.from(
      (await chunkOf(at, Math.min(FILE_CHUNK_BYTES, last - at + 1))).data,
      'base64',
    );
    if (part.length === 0) {
      return;
    }
    yield part;
    at += part.length;
  }
}

export function attachment(name: string): string {
  const plain = name.replace(/[^A-Za-z0-9._ -]/g, '_');
  return `attachment; filename="${plain}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export function computerDownloadRoute({ store, directory }: Options): RawRoute {
  const access = new ComputerAccess(store);
  return {
    method: 'GET',
    path: COMPUTER_DOWNLOAD_PATH,
    handle: async (request, response, params): Promise<void> => {
      const viewer = viewerOf(store, authenticate(store, request, 'member', false));
      const deviceId = params['deviceId'] ?? '';
      const path = FILE_PATH.safeParse(
        new URL(request.url ?? '/', 'http://hub').searchParams.get('path'),
      );
      if (!path.success) {
        throw new ApiError('invalid_request', 'Send the absolute path of the file as ?path=.');
      }
      const chunkOf: ChunkOf = (start, length) =>
        guarded(async () => {
          access.require(deviceId, 'files', viewer);
          const call = { verb: 'file_range', path: path.data, start, length } as const;
          return FILE_RANGE.parse(await directory.byDevice(deviceId).call(call));
        });
      const head = await chunkOf(0, 1);
      await sendBytes(
        {
          size: head.size,
          headers: {
            'content-type': head.mimeType,
            'content-disposition': attachment(head.name),
            'cache-control': 'no-store',
          },
          stream: (range) =>
            Readable.from(chunks(chunkOf, range?.start ?? 0, range?.end ?? head.size - 1)),
        },
        request,
        response,
      );
    },
  };
}

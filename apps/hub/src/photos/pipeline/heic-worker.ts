import { parentPort } from 'node:worker_threads';
import { HeifDecoder, type HeifImage } from 'libheif-js/wasm-bundle';
import { z } from 'zod';

export const HEIC_REQUEST = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('open'), bytes: z.instanceof(Uint8Array) }),
  z.strictObject({ kind: z.literal('display') }),
]);

export type HeicRequest = z.infer<typeof HEIC_REQUEST>;

export type HeicReply =
  | { readonly kind: 'opened'; readonly width: number; readonly height: number }
  | { readonly kind: 'unsupported'; readonly reason: string }
  | {
      readonly kind: 'pixels';
      readonly width: number;
      readonly height: number;
      readonly data: Uint8Array<ArrayBuffer>;
    };

const NOT_READABLE =
  'The file is not a readable HEIF image (it is truncated, damaged or not HEIF).';

const NO_PRIMARY = 'The file has no primary image.';

const NOT_RENDERED = 'The decoder could not render the image, which may be too large to hold.';

const RGBA_CHANNELS = 4;

let opened: HeifImage | undefined;

function unsupported(reason: string): HeicReply {
  return { kind: 'unsupported', reason };
}

function open(bytes: Uint8Array): HeicReply {
  const images = new HeifDecoder().decode(bytes);
  if (images.length === 0) return unsupported(NOT_READABLE);
  const primary = images.find((image) => image.is_primary());
  if (primary === undefined) return unsupported(NO_PRIMARY);
  opened = primary;
  return { kind: 'opened', width: primary.get_width(), height: primary.get_height() };
}

function display(image: HeifImage, reply: (message: HeicReply) => void): void {
  const width = image.get_width();
  const height = image.get_height();
  const target = { data: new Uint8ClampedArray(width * height * RGBA_CHANNELS), width, height };
  image.display(target, (result) => {
    if (result === null) {
      reply(unsupported(NOT_RENDERED));
      return;
    }
    reply({ kind: 'pixels', width, height, data: new Uint8Array(result.data.buffer) });
  });
}

function send(message: HeicReply): void {
  const transfer: ArrayBuffer[] = message.kind === 'pixels' ? [message.data.buffer] : [];
  parentPort?.postMessage(message, transfer);
}

function handle(request: HeicRequest): void {
  if (request.kind === 'open') {
    opened = undefined;
    send(open(request.bytes));
    return;
  }
  const image = opened;
  opened = undefined;
  if (image === undefined) throw new Error('No HEIC image is open.');
  display(image, send);
}

parentPort?.on('message', (raw: unknown) => {
  handle(HEIC_REQUEST.parse(raw));
});

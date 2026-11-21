import { createHash } from 'node:crypto';
import { ApiError, type PhoneIconUpload } from '@smarteverything/domain';
import type { Store } from '../store/store';

const RIFF = 'RIFF';
const WEBP = 'WEBP';
const RIFF_AT = 0;
const FORMAT_AT = 8;
const MAGIC_LENGTH = 4;

function isWebp(bytes: Uint8Array): boolean {
  const text = (from: number): string =>
    Buffer.from(bytes.subarray(from, from + MAGIC_LENGTH)).toString('latin1');
  return text(RIFF_AT) === RIFF && text(FORMAT_AT) === WEBP;
}

export async function savePhoneIcon(
  store: Pick<Store, 'host'>,
  upload: PhoneIconUpload,
): Promise<void> {
  const bytes = Buffer.from(upload.webpBase64, 'base64');
  if (createHash('sha256').update(bytes).digest('hex') !== upload.hash) {
    throw new ApiError('invalid_request', 'The icon does not match its hash.');
  }
  if (!isWebp(bytes)) {
    throw new ApiError('invalid_request', 'The icon is not a WebP image.');
  }
  await store.host.call('phoneIcons', 'save', upload.hash, new Uint8Array(bytes));
}

export async function readPhoneIcon(
  store: Pick<Store, 'host'>,
  hash: string,
): Promise<PhoneIconUpload> {
  const bytes = await store.host.call('phoneIcons', 'find', hash);
  if (bytes === undefined) {
    throw new ApiError('not_found', 'The hub has no icon with this hash.');
  }
  return { hash, webpBase64: Buffer.from(bytes).toString('base64') };
}

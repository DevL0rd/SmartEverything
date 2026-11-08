import { createHash } from 'node:crypto';
import { ApiError } from '@smarteverything/domain';

const HERMES_MAGIC = Buffer.from('c61fbc03c103191f', 'hex');
const HERMES_LENGTH_OFFSET = 32;
const HERMES_FOOTER_BYTES = 20;

export function verifyHermesBundle(path: string, bundle: Buffer): void {
  const footerOffset = bundle.length - HERMES_FOOTER_BYTES;
  if (
    footerOffset < HERMES_LENGTH_OFFSET + 4 ||
    !bundle.subarray(0, HERMES_MAGIC.length).equals(HERMES_MAGIC) ||
    bundle.readUInt32LE(HERMES_LENGTH_OFFSET) !== bundle.length
  ) {
    throw new ApiError('invalid_request', `${path} is not an Android Hermes bytecode bundle.`);
  }
  const digest = createHash('sha1').update(bundle.subarray(0, footerOffset)).digest();
  if (!digest.equals(bundle.subarray(footerOffset))) {
    throw new ApiError('invalid_request', `${path} changed after Hermes compilation.`);
  }
  if (!bundle.includes('SHA-256')) {
    throw new ApiError('invalid_request', `${path} is missing the native SHA-256 algorithm name.`);
  }
}

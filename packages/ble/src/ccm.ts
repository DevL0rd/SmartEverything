import { ecb } from '@noble/ciphers/aes.js';
import { concatBytes, equalBytes } from '@noble/ciphers/utils.js';

const BLOCK = 16;
const NONCE_BYTES = 12;
const LENGTH_BYTES = BLOCK - 1 - NONCE_BYTES;
const MAX_AAD = 0xfeff;

class CcmInputError extends Error {
  override readonly name = 'CcmInputError';
}

export class CcmTagMismatchError extends Error {
  override readonly name = 'CcmTagMismatchError';

  constructor() {
    super(
      'The message authentication code does not match; the key is wrong or the frame was altered.',
    );
  }
}

export interface CcmInput {
  readonly key: Uint8Array;
  readonly nonce: Uint8Array;
  readonly ciphertext: Uint8Array;
  readonly tag: Uint8Array;
  readonly aad: Uint8Array;
}

function checked(input: CcmInput): void {
  if (input.key.length !== BLOCK) {
    throw new CcmInputError(
      `AES-CCM needs a 16-byte key, received ${String(input.key.length)} bytes.`,
    );
  }
  if (input.nonce.length !== NONCE_BYTES) {
    throw new CcmInputError(
      `AES-CCM here needs a 12-byte nonce, received ${String(input.nonce.length)}.`,
    );
  }
  if (input.tag.length < 4 || input.tag.length > BLOCK || input.tag.length % 2 !== 0) {
    throw new CcmInputError(
      `AES-CCM tags are 4 to 16 even bytes, received ${String(input.tag.length)}.`,
    );
  }
  if (input.aad.length > MAX_AAD) {
    throw new CcmInputError('AES-CCM associated data longer than 65279 bytes is not supported.');
  }
}

function padded(bytes: Uint8Array): Uint8Array {
  const rest = bytes.length % BLOCK;
  return rest === 0 ? bytes : concatBytes(bytes, new Uint8Array(BLOCK - rest));
}

function counterBlock(nonce: Uint8Array, counter: number): Uint8Array {
  const block = new Uint8Array(BLOCK);
  block[0] = LENGTH_BYTES - 1;
  block.set(nonce, 1);
  block[13] = (counter >> 16) & 0xff;
  block[14] = (counter >> 8) & 0xff;
  block[15] = counter & 0xff;
  return block;
}

function firstBlock(input: CcmInput, length: number): Uint8Array {
  const block = counterBlock(input.nonce, length);
  const adata = input.aad.length > 0 ? 0x40 : 0;
  block[0] = adata | (((input.tag.length - 2) / 2) << 3) | (LENGTH_BYTES - 1);
  return block;
}

function xor(left: Uint8Array, right: Uint8Array): Uint8Array {
  return left.map((byte, index) => byte ^ (right[index] ?? 0));
}

function cbcMac(encrypt: (block: Uint8Array) => Uint8Array, blocks: Uint8Array): Uint8Array {
  let state: Uint8Array = new Uint8Array(BLOCK);
  for (let offset = 0; offset < blocks.length; offset += BLOCK) {
    state = encrypt(xor(state, blocks.subarray(offset, offset + BLOCK)));
  }
  return state;
}

function aadBlocks(aad: Uint8Array): Uint8Array {
  if (aad.length === 0) {
    return new Uint8Array(0);
  }
  return padded(concatBytes(new Uint8Array([aad.length >> 8, aad.length & 0xff]), aad));
}

export function decryptCcm(input: CcmInput): Uint8Array {
  checked(input);
  const encrypt = (block: Uint8Array): Uint8Array =>
    ecb(input.key, { disablePadding: true }).encrypt(block);
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < input.ciphertext.length; offset += BLOCK) {
    const keystream = encrypt(counterBlock(input.nonce, offset / BLOCK + 1));
    chunks.push(xor(input.ciphertext.subarray(offset, offset + BLOCK), keystream));
  }
  const plain = concatBytes(...chunks);
  const header = concatBytes(firstBlock(input, plain.length), aadBlocks(input.aad));
  const mac = cbcMac(encrypt, concatBytes(header, padded(plain)));
  const tag = xor(mac.subarray(0, input.tag.length), encrypt(counterBlock(input.nonce, 0)));
  if (!equalBytes(tag, input.tag)) {
    throw new CcmTagMismatchError();
  }
  return plain;
}

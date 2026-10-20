const ROUND_CONSTANTS = Uint32Array.from([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const INITIAL_STATE = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
] as const;

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

function pad(message: Uint8Array): Uint8Array {
  const total = Math.ceil((message.length + 9) / 64) * 64;
  const padded = new Uint8Array(total);
  padded.set(message);
  padded[message.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(total - 8, Math.floor((message.length * 8) / 0x100000000));
  view.setUint32(total - 4, (message.length * 8) >>> 0);
  return padded;
}

function schedule(view: DataView, offset: number): Uint32Array {
  const words = new Uint32Array(64);
  for (let index = 0; index < 16; index += 1) {
    words[index] = view.getUint32(offset + index * 4);
  }
  for (let index = 16; index < 64; index += 1) {
    const w15 = at(words, index - 15);
    const w2 = at(words, index - 2);
    const small0 = rotateRight(w15, 7) ^ rotateRight(w15, 18) ^ (w15 >>> 3);
    const small1 = rotateRight(w2, 17) ^ rotateRight(w2, 19) ^ (w2 >>> 10);
    words[index] = (at(words, index - 16) + small0 + at(words, index - 7) + small1) >>> 0;
  }
  return words;
}

function at(list: ArrayLike<number>, index: number): number {
  return Number(list[index]);
}

function compress(state: Uint32Array, words: Uint32Array): Uint32Array {
  const work = Uint32Array.from(state);
  for (let index = 0; index < 64; index += 1) {
    const e = at(work, 4);
    const a = at(work, 0);
    const big1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
    const choice = (e & at(work, 5)) ^ (~e & at(work, 6));
    const first =
      (at(work, 7) + big1 + choice + at(ROUND_CONSTANTS, index) + at(words, index)) >>> 0;
    const big0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
    const majority = (a & at(work, 1)) ^ (a & at(work, 2)) ^ (at(work, 1) & at(work, 2));
    const second = (big0 + majority) >>> 0;
    const d = at(work, 3);
    work.copyWithin(1, 0, 7);
    work[0] = (first + second) >>> 0;
    work[4] = (d + first) >>> 0;
  }
  return Uint32Array.from(state, (value, index) => (value + at(work, index)) >>> 0);
}

export function sha256Hex(text: string): string {
  const padded = pad(new TextEncoder().encode(text));
  const view = new DataView(padded.buffer);
  let state: Uint32Array = Uint32Array.from(INITIAL_STATE);
  for (let offset = 0; offset < padded.length; offset += 64) {
    state = compress(state, schedule(view, offset));
  }
  return Array.from(state, (word) => word.toString(16).padStart(8, '0')).join('');
}

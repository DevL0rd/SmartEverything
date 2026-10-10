const STATE_SIZE = 256;
const DROPPED_BYTES = 1024;

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function swap(state: DataView, i: number, j: number): void {
  const first = state.getUint8(i);
  state.setUint8(i, state.getUint8(j));
  state.setUint8(j, first);
}

function schedule(key: Uint8Array): DataView {
  const state = view(Uint8Array.from({ length: STATE_SIZE }, (_, index) => index));
  const keyView = view(key);
  let j = 0;
  for (let i = 0; i < STATE_SIZE; i += 1) {
    j = (j + state.getUint8(i) + keyView.getUint8(i % key.length)) % STATE_SIZE;
    swap(state, i, j);
  }
  return state;
}

export function rc4Drop1024(key: Uint8Array, data: Uint8Array): Uint8Array {
  const state = schedule(key);
  const output = new Uint8Array(data.length);
  let i = 0;
  let j = 0;
  for (let index = 0; index < DROPPED_BYTES + data.length; index += 1) {
    i = (i + 1) % STATE_SIZE;
    j = (j + state.getUint8(i)) % STATE_SIZE;
    swap(state, i, j);
    const position = index - DROPPED_BYTES;
    if (position >= 0) {
      const stream = state.getUint8((state.getUint8(i) + state.getUint8(j)) % STATE_SIZE);
      output[position] = view(data).getUint8(position) ^ stream;
    }
  }
  return output;
}

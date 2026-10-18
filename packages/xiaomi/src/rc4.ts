const STATE_SIZE = 256;
const DROPPED_BYTES = 1024;

function swap(state: DataView, i: number, j: number): void {
  const first = state.getUint8(i);
  state.setUint8(i, state.getUint8(j));
  state.setUint8(j, first);
}

function schedule(key: Uint8Array): DataView {
  const state = new DataView(Uint8Array.from({ length: STATE_SIZE }, (_, index) => index).buffer);
  const keyView = new DataView(key.buffer, key.byteOffset, key.byteLength);
  let j = 0;
  for (let i = 0; i < STATE_SIZE; i += 1) {
    j = (j + state.getUint8(i) + keyView.getUint8(i % key.length)) % STATE_SIZE;
    swap(state, i, j);
  }
  return state;
}

function keystream(key: Uint8Array): () => number {
  const state = schedule(key);
  let i = 0;
  let j = 0;
  return () => {
    i = (i + 1) % STATE_SIZE;
    j = (j + state.getUint8(i)) % STATE_SIZE;
    swap(state, i, j);
    return state.getUint8((state.getUint8(i) + state.getUint8(j)) % STATE_SIZE);
  };
}

export function rc4Drop1024(key: Uint8Array, data: Uint8Array): Uint8Array {
  const next = keystream(key);
  for (let dropped = 0; dropped < DROPPED_BYTES; dropped += 1) {
    next();
  }
  return data.map((byte) => byte ^ next());
}

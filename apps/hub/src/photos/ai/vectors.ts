export class VectorShapeError extends Error {
  override readonly name = 'VectorShapeError';

  constructor(readonly what: string) {
    super(`The ${what} is not a whole number of 32-bit floats.`);
  }
}

const FLOAT_BYTES = 4;

export function float32Bytes(vector: Float32Array): Uint8Array {
  const bytes = new Uint8Array(vector.length * FLOAT_BYTES);
  const view = new DataView(bytes.buffer);
  vector.forEach((value, index) => {
    view.setFloat32(index * FLOAT_BYTES, value, true);
  });
  return bytes;
}

export function float32Of(bytes: Uint8Array): Float32Array {
  if (bytes.byteLength % FLOAT_BYTES !== 0) throw new VectorShapeError('stored vector');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const vector = new Float32Array(bytes.byteLength / FLOAT_BYTES);
  for (let index = 0; index < vector.length; index += 1)
    vector[index] = view.getFloat32(index * FLOAT_BYTES, true);
  return vector;
}

export function normalise(vector: Float32Array): Float32Array {
  let sum = 0;
  for (const value of vector) sum += value * value;
  const norm = Math.sqrt(sum);
  return norm === 0 ? vector : vector.map((value) => value / norm);
}

export interface QuantisedVector {
  readonly scale: number;
  readonly bytes: Uint8Array;
}

const INT8_MAX = 127;

export function quantise(vector: Float32Array): QuantisedVector {
  const unit = normalise(vector);
  let peak = 0;
  for (const value of unit) peak = Math.max(peak, Math.abs(value));
  const scale = peak === 0 ? 1 : peak / INT8_MAX;
  const bytes = new Uint8Array(unit.length);
  const signed = new Int8Array(bytes.buffer);
  unit.forEach((value, index) => {
    signed[index] = Math.round(value / scale);
  });
  return { scale, bytes };
}

export function int8Of(bytes: Uint8Array): Int8Array {
  return new Int8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

export function dotInt8(query: Float32Array, stored: Int8Array, scale: number): number {
  let sum = 0;
  const length = Math.min(query.length, stored.length);
  for (let index = 0; index < length; index += 1) sum += (query[index] ?? 0) * (stored[index] ?? 0);
  return sum * scale;
}

const WORD = 4;

interface Span {
  readonly source: Uint8Array;
  readonly key: Uint8Array;
  readonly target: Uint8Array;
}

function keyByte(key: Uint8Array, index: number): number {
  return key[index % WORD] ?? 0;
}

function xorBytes(span: Span, start: number, end: number): void {
  const { source, key, target } = span;
  for (let index = start; index < end; index += 1) {
    target[index] = (source[index] ?? 0) ^ keyByte(key, index);
  }
}

function keyWord(key: Uint8Array, start: number): number {
  const bytes = new Uint8Array(WORD);
  for (let index = 0; index < WORD; index += 1) bytes[index] = keyByte(key, start + index);
  return new Uint32Array(bytes.buffer)[0] ?? 0;
}

function xorWords(span: Span, start: number, words: number): void {
  const { source, key, target } = span;
  const word = keyWord(key, start);
  const from = new Uint32Array(source.buffer, source.byteOffset + start, words);
  const to = new Uint32Array(target.buffer, target.byteOffset + start, words);
  for (let index = 0; index < words; index += 1) to[index] = (from[index] ?? 0) ^ word;
}

function xorSpan(span: Span): void {
  const length = span.target.length;
  const head = Math.min(length, (WORD - (span.target.byteOffset % WORD)) % WORD);
  const words = Math.floor((length - head) / WORD);
  xorBytes(span, 0, head);
  if (words > 0 && (span.source.byteOffset + head) % WORD === 0) xorWords(span, head, words);
  else xorBytes(span, head, head + words * WORD);
  xorBytes(span, head + words * WORD, length);
}

type MaskArguments = [
  source: Uint8Array,
  key: Uint8Array,
  output: Uint8Array,
  offset: number,
  length: number,
];

export function mask(...[source, key, output, offset, length]: MaskArguments): void {
  const target = new Uint8Array(output.buffer, output.byteOffset + offset, length);
  xorSpan({ source: source.subarray(0, length), key, target });
}

export function unmask(buffer: Uint8Array, key: Uint8Array): void {
  const target = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.length);
  xorSpan({ source: target, key, target });
}

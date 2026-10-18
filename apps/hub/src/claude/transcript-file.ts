import { open, stat } from 'node:fs/promises';
import { ClaudeFileReadError } from './errors';
import { isMissing } from '../fs-util';

const CHUNK_BYTES = 256 * 1024;
const LONGEST_LINE_BYTES = 16 * 1024 * 1024;
const NEWLINE = 0x0a;
const HEAD_BYTES = 400;

export interface RawLine {
  readonly offset: number;
  readonly head: string;
  readonly text: string | null;
}

function lineOf(offset: number, bytes: Buffer, oversized: boolean): RawLine {
  return {
    offset,
    head: bytes.subarray(0, HEAD_BYTES).toString('utf8'),
    text: oversized ? null : bytes.toString('utf8'),
  };
}

export async function sizeOf(path: string): Promise<number | null> {
  try {
    return (await stat(path)).size;
  } catch (cause) {
    if (isMissing(cause)) {
      return null;
    }
    throw new ClaudeFileReadError(path, cause);
  }
}

export async function* linesBackward(path: string, end: number): AsyncGenerator<RawLine> {
  const handle = await open(path, 'r');
  try {
    let position = end;
    let tail = Buffer.alloc(0);
    let oversized = false;
    while (position > 0) {
      const start = Math.max(0, position - CHUNK_BYTES);
      const chunk = Buffer.alloc(position - start);
      await handle.read(chunk, 0, chunk.length, start);
      const data = Buffer.concat([chunk, tail]);
      let lineEnd = data.length;
      let newline = data.lastIndexOf(NEWLINE, lineEnd - 1);
      while (newline !== -1) {
        if (lineEnd > newline + 1 || oversized) {
          yield lineOf(start + newline + 1, data.subarray(newline + 1, lineEnd), oversized);
        }
        oversized = false;
        lineEnd = newline;
        newline = lineEnd > 0 ? data.lastIndexOf(NEWLINE, lineEnd - 1) : -1;
      }
      tail = data.subarray(0, lineEnd);
      if (tail.length > LONGEST_LINE_BYTES) {
        oversized = true;
        tail = tail.subarray(0, HEAD_BYTES);
      }
      position = start;
    }
    if (tail.length > 0 || oversized) {
      yield lineOf(0, tail, oversized);
    }
  } finally {
    await handle.close();
  }
}

export interface Appended {
  readonly lines: readonly RawLine[];
  readonly next: number;
}

export async function readAppended(path: string, from: number, size: number): Promise<Appended> {
  const handle = await open(path, 'r');
  try {
    const bytes = Buffer.alloc(Math.min(size - from, LONGEST_LINE_BYTES));
    await handle.read(bytes, 0, bytes.length, from);
    const last = bytes.lastIndexOf(NEWLINE);
    if (last === -1) {
      return bytes.length < LONGEST_LINE_BYTES
        ? { lines: [], next: from }
        : { lines: [lineOf(from, bytes, true)], next: from + bytes.length };
    }
    const lines: RawLine[] = [];
    let lineStart = 0;
    for (let at = bytes.indexOf(NEWLINE); at !== -1; at = bytes.indexOf(NEWLINE, lineStart)) {
      if (at > lineStart) {
        lines.push(lineOf(from + lineStart, bytes.subarray(lineStart, at), false));
      }
      lineStart = at + 1;
    }
    return { lines, next: from + last + 1 };
  } finally {
    await handle.close();
  }
}

export async function endsWithNewline(path: string, size: number): Promise<boolean> {
  if (size === 0) {
    return true;
  }
  const handle = await open(path, 'r');
  try {
    const byte = Buffer.alloc(1);
    await handle.read(byte, 0, 1, size - 1);
    return byte[0] === NEWLINE;
  } finally {
    await handle.close();
  }
}

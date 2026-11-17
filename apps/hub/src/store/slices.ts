export const SLICE_MS = 4;

export type Yield = (resume: () => void) => void;

export interface SliceWriter {
  readonly write: <T>(work: () => T) => T;
}

function nextTurn(defer: Yield): Promise<void> {
  return new Promise((resolve) => {
    defer(resolve);
  });
}

function slice<T>(iterator: Iterator<T>, work: (item: T) => void): boolean {
  const started = performance.now();
  for (let next = iterator.next(); next.done !== true; next = iterator.next()) {
    work(next.value);
    if (performance.now() - started >= SLICE_MS) return false;
  }
  return true;
}

export async function inSlices<T>(
  writer: SliceWriter,
  items: Iterable<T>,
  work: (item: T) => void,
  defer: Yield = setImmediate,
): Promise<void> {
  const iterator = items[Symbol.iterator]();
  while (!writer.write(() => slice(iterator, work))) await nextTurn(defer);
}

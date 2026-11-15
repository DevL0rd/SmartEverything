export interface Span {
  readonly x: number;
  readonly width: number;
}

export type Spans = Readonly<Record<string, Span>>;

export function revealedAt(spans: Spans, span: Span, viewport: number): number {
  const needed = span.x + span.width - viewport;
  if (needed <= 0) {
    return 0;
  }
  const all = Object.values(spans);
  const end = Math.max(...all.map((other) => other.x + other.width));
  const last = Math.max(0, end - viewport);
  const snapped = all
    .map((other) => other.x)
    .filter((x) => x >= needed && x <= last)
    .sort((left, right) => left - right)
    .at(0);
  return Math.min(span.x, snapped ?? last);
}

function sameSpan(left: Span | undefined, right: Span): boolean {
  return left?.x === right.x && left.width === right.width;
}

export function settledSpans(
  keys: readonly string[],
  measured: Spans,
  current: Spans,
): Spans | null {
  const complete = keys.every((key) => measured[key] !== undefined);
  if (!complete) {
    return null;
  }
  const next: Record<string, Span> = {};
  for (const key of keys) {
    const span = measured[key];
    if (span !== undefined) {
      next[key] = span;
    }
  }
  const unchanged =
    Object.keys(current).length === keys.length &&
    keys.every((key) => {
      const span = next[key];
      return span !== undefined && sameSpan(current[key], span);
    });
  return unchanged ? null : next;
}

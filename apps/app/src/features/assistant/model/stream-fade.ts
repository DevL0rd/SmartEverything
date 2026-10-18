export const FADE_MS = 760;
export const SPREAD_MS = 80;
export const MAX_SLICES = 3;
const MIN_SLICE = 5;

const ZWJ = 0x200d;
const CR = 0x0d;
const LF = 0x0a;
const REGIONAL_FIRST = 0x1f1e6;
const REGIONAL_LAST = 0x1f1ff;

const EXTENDING: readonly (readonly [number, number])[] = [
  [0x0300, 0x036f],
  [0x0483, 0x0489],
  [0x0591, 0x05bd],
  [0x064b, 0x065f],
  [0x0900, 0x0903],
  [0x093a, 0x094f],
  [0x0e31, 0x0e31],
  [0x0e34, 0x0e3a],
  [0x0e47, 0x0e4e],
  [0x1ab0, 0x1aff],
  [0x1dc0, 0x1dff],
  [0x200c, 0x200d],
  [0x20d0, 0x20ff],
  [0x3099, 0x309a],
  [0xfe00, 0xfe0f],
  [0xfe20, 0xfe2f],
  [0x1f3fb, 0x1f3ff],
  [0xe0020, 0xe007f],
];

function extends_(codePoint: number): boolean {
  return EXTENDING.some(([first, last]) => codePoint >= first && codePoint <= last);
}

function regional(codePoint: number): boolean {
  return codePoint >= REGIONAL_FIRST && codePoint <= REGIONAL_LAST;
}

interface Cluster {
  text: string;
  last: number;
  flagHalves: number;
}

function joinsCluster(cluster: Cluster, codePoint: number): boolean {
  if (extends_(codePoint) || cluster.last === ZWJ) return true;
  if (cluster.last === CR) return codePoint === LF;
  return regional(codePoint) && regional(cluster.last) && cluster.flagHalves % 2 === 1;
}

export function graphemesOf(text: string): readonly string[] {
  const clusters: string[] = [];
  let cluster: Cluster | null = null;
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (cluster !== null && joinsCluster(cluster, codePoint)) {
      cluster.text += character;
      cluster.last = codePoint;
      cluster.flagHalves += regional(codePoint) ? 1 : 0;
    } else {
      if (cluster !== null) clusters.push(cluster.text);
      cluster = { text: character, last: codePoint, flagHalves: regional(codePoint) ? 1 : 0 };
    }
  }
  if (cluster !== null) clusters.push(cluster.text);
  return clusters;
}

export function graphemeCount(text: string): number {
  return graphemesOf(text).length;
}

export interface Batch {
  readonly id: number;
  readonly from: number;
  readonly to: number;
  readonly at: number;
}

export interface Ledger {
  readonly total: number;
  readonly nextId: number;
  readonly batches: readonly Batch[];
}

export function settledLedger(total: number): Ledger {
  return { total, nextId: 0, batches: [] };
}

function clipped(batches: readonly Batch[], total: number): readonly Batch[] {
  return batches
    .filter((batch) => batch.from < total)
    .map((batch) => (batch.to > total ? { ...batch, to: total } : batch));
}

export function holdLedger(ledger: Ledger, total: number): Ledger {
  return { ...ledger, total, batches: clipped(ledger.batches, total) };
}

function slicesOf(from: number, to: number, nextId: number, now: number): readonly Batch[] {
  const count = Math.min(MAX_SLICES, Math.max(1, Math.floor((to - from) / MIN_SLICE)));
  const size = Math.ceil((to - from) / count);
  return Array.from({ length: count }, (_, slice) => ({
    id: nextId + slice,
    from: from + slice * size,
    to: Math.min(to, from + (slice + 1) * size),
    at: now + Math.round((slice * SPREAD_MS) / count),
  })).filter((batch) => batch.from < batch.to);
}

export function arrive(ledger: Ledger, total: number, now: number): Ledger {
  const live = clipped(ledger.batches, total).filter((batch) => now - batch.at < FADE_MS);
  if (total <= ledger.total) return { ...ledger, total, batches: live };
  const added = slicesOf(ledger.total, total, ledger.nextId, now);
  return { total, nextId: ledger.nextId + added.length, batches: [...live, ...added] };
}

export function batchesWithin(ledger: Ledger, from: number, to: number): readonly Batch[] | null {
  const hits = ledger.batches.filter((batch) => batch.from < to && batch.to > from);
  return hits.length === 0 ? null : hits;
}

export interface Piece {
  readonly text: string;
  readonly batch: Batch | null;
}

function batchAt(batches: readonly Batch[], index: number): Batch | null {
  return batches.find((batch) => index >= batch.from && index < batch.to) ?? null;
}

export function piecesOf(text: string, start: number, batches: readonly Batch[]): readonly Piece[] {
  const pieces: Piece[] = [];
  let open: { text: string; batch: Batch | null } = { text: '', batch: null };
  graphemesOf(text).forEach((letter, offset) => {
    const batch = batchAt(batches, start + offset);
    if (pieces.length === 0 || open.batch !== batch) {
      open = { text: '', batch };
      pieces.push(open);
    }
    open.text += letter;
  });
  return pieces;
}

export function elapsedMs(batch: Batch, now: number): number {
  return now - batch.at;
}

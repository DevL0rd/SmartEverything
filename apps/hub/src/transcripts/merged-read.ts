import type { TranscriptLine } from '@smarteverything/domain';

const MIN_OVERLAP = 0.5;
const MIN_SIMILARITY = 0.8;
const WORDS = new Intl.Segmenter(undefined, { granularity: 'word' });

export interface HeardLine {
  readonly line: TranscriptLine;
  readonly origin: string;
  readonly levelDbfs: number | null;
}

interface Entry {
  readonly heard: HeardLine;
  readonly index: number;
  readonly start: number;
  readonly end: number;
  readonly words: ReadonlySet<string>;
}

function wordsOf(text: string): ReadonlySet<string> {
  const words = new Set<string>();
  for (const part of WORDS.segment(text.toLowerCase())) {
    if (part.isWordLike === true) {
      words.add(part.segment);
    }
  }
  return words;
}

function entryOf(heard: HeardLine, index: number): Entry {
  const start = Date.parse(heard.line.at);
  const end =
    heard.line.ended_at === null || heard.line.ended_at === undefined
      ? start
      : Math.max(start, Date.parse(heard.line.ended_at));
  return { heard, index, start, end, words: wordsOf(heard.line.text) };
}

function overlapping(first: Entry, second: Entry): boolean {
  const shorter = Math.min(first.end - first.start, second.end - second.start);
  const shared = Math.min(first.end, second.end) - Math.max(first.start, second.start);
  return shared >= 0 && shared >= shorter * MIN_OVERLAP;
}

function similar(first: Entry, second: Entry): boolean {
  let common = 0;
  for (const word of first.words) {
    if (second.words.has(word)) {
      common += 1;
    }
  }
  const all = first.words.size + second.words.size - common;
  return all > 0 && common / all >= MIN_SIMILARITY;
}

function levelOf(entry: Entry): number {
  return entry.heard.levelDbfs ?? Number.NEGATIVE_INFINITY;
}

export function collapseHeard(heard: readonly HeardLine[]): HeardLine[] {
  const entries = heard.map(entryOf).sort((a, b) => a.start - b.start || a.index - b.index);
  const dropped = new Set<number>();
  entries.forEach((first, at) => {
    if (dropped.has(first.index)) {
      return;
    }
    for (const second of entries.slice(at + 1)) {
      if (second.start > first.end) {
        return;
      }
      const same = second.heard.origin === first.heard.origin;
      if (
        dropped.has(second.index) ||
        same ||
        !overlapping(first, second) ||
        !similar(first, second)
      ) {
        continue;
      }
      const loser = levelOf(second) > levelOf(first) ? first : second;
      dropped.add(loser.index);
      if (loser === first) {
        return;
      }
    }
  });
  return heard.filter((_, index) => !dropped.has(index));
}

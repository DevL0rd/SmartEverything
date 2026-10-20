import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { WakeSensitivity } from '@smarteverything/domain';
import { pieceVocabulary, wordPieces, type PieceVocabulary } from './word-pieces';

const WAKE_SENSITIVITY_SCORES: Readonly<Record<WakeSensitivity, number>> = {
  standard: 0.15,
  high: 0.1,
  highest: 0.08,
};

const NEAR_SHARE = 0.4;

export function thresholdOf(sensitivity: WakeSensitivity): number {
  return WAKE_SENSITIVITY_SCORES[sensitivity];
}

export function nearThresholdOf(sensitivity: WakeSensitivity): number {
  return Math.round(thresholdOf(sensitivity) * NEAR_SHARE * 1000) / 1000;
}

function vocabularyDirectory(): string {
  return fileURLToPath(new URL('wake-name-model/', import.meta.url));
}

export function wakePhrases(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const phrases: string[] = [];
  for (const name of names.map((candidate) => candidate.trim())) {
    const key = name.toLocaleLowerCase();
    if (name !== '' && !seen.has(key)) {
      seen.add(key);
      phrases.push(name, `hey ${name}`);
    }
  }
  return phrases;
}

function keywordLines(vocabulary: PieceVocabulary, phrases: readonly string[]): string {
  return phrases
    .map((phrase) => {
      const pieces = wordPieces(vocabulary, phrase);
      return pieces === null ? null : `${pieces.join(' ')} @${phrase.replace(/[\s@#:]+/g, '_')}`;
    })
    .filter((line) => line !== null)
    .join('\n');
}

export interface EarKeywords {
  readonly keywords: readonly string[];
  readonly threshold: number;
  readonly nearMissThreshold: number;
}

export class WakeKeywords {
  private readonly vocabulary: PieceVocabulary;

  constructor(directory: string = vocabularyDirectory()) {
    this.vocabulary = pieceVocabulary(readFileSync(`${directory}bpe.vocab`, 'utf8'));
  }

  earConfig(names: readonly string[], sensitivity: WakeSensitivity): EarKeywords {
    return {
      keywords: keywordLines(this.vocabulary, wakePhrases(names))
        .split('\n')
        .filter((line) => line !== ''),
      threshold: thresholdOf(sensitivity),
      nearMissThreshold: nearThresholdOf(sensitivity),
    };
  }
}

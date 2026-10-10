const WORD_START = '▁';

export interface PieceVocabulary {
  readonly scores: ReadonlyMap<string, number>;
  readonly longest: number;
}

export function pieceVocabulary(text: string): PieceVocabulary {
  const scores = new Map<string, number>();
  for (const line of text.split('\n')) {
    const [piece = '', score = ''] = line.split('\t');
    const value = Number(score);
    if (piece !== '' && !piece.startsWith('<') && Number.isFinite(value)) {
      scores.set(piece, value);
    }
  }
  const longest = Math.max(...[...scores.keys()].map((piece) => piece.length));
  return { scores, longest };
}

interface Best {
  readonly score: number;
  readonly from: number;
  readonly piece: string;
}

function bestPaths(vocabulary: PieceVocabulary, text: string): (Best | null)[] {
  const best: (Best | null)[] = [{ score: 0, from: -1, piece: '' }];
  for (let end = 1; end <= text.length; end++) {
    let found: Best | null = null;
    for (let start = Math.max(0, end - vocabulary.longest); start < end; start++) {
      const before = best[start];
      const score = vocabulary.scores.get(text.slice(start, end));
      if (before !== null && before !== undefined && score !== undefined) {
        const total = before.score + score;
        if (found === null || total > found.score) {
          found = { score: total, from: start, piece: text.slice(start, end) };
        }
      }
    }
    best.push(found);
  }
  return best;
}

export function wordPieces(vocabulary: PieceVocabulary, phrase: string): string[] | null {
  const words =
    phrase
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toUpperCase()
      .match(/[A-Z']+/g) ?? [];
  if (words.length === 0) {
    return null;
  }
  const text = words.map((word) => `${WORD_START}${word}`).join('');
  const best = bestPaths(vocabulary, text);
  const pieces: string[] = [];
  for (let at = text.length; at > 0;) {
    const step = best[at];
    if (step === null || step === undefined) {
      return null;
    }
    pieces.unshift(step.piece);
    at = step.from;
  }
  return pieces;
}

import { tokenScore, tokensOf } from '@smarteverything/domain';

export function rankMatches<T>(
  items: readonly T[],
  query: string,
  words: (item: T) => { readonly title: string; readonly extra: string },
): T[] {
  const tokens = tokensOf(query);
  if (tokens.length === 0) return [...items];
  const scored: { readonly item: T; readonly score: number }[] = [];
  for (const item of items) {
    const { title, extra } = words(item);
    const scores = tokens.map((token) =>
      tokenScore(token, title.toLowerCase(), extra.toLowerCase()),
    );
    if (scores.every((score) => score > 0))
      scored.push({ item, score: scores.reduce((sum, score) => sum + score, 0) });
  }
  return scored.sort((left, right) => right.score - left.score).map(({ item }) => item);
}

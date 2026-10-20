const MOST_CHARS = 66;

export function copyName(base: string, taken: readonly string[]): string {
  const used = new Set(taken.map((name) => name.toLowerCase()));
  const first = `${base.slice(0, MOST_CHARS)} copy`;
  let candidate = first;
  for (let number = 2; used.has(candidate.toLowerCase()); number += 1) {
    candidate = `${first} ${String(number)}`;
  }
  return candidate;
}

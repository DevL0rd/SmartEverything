export function cn(...parts: readonly (string | false | null | undefined)[]): string {
  let joined = '';
  for (const part of parts) {
    if (typeof part === 'string' && part !== '') {
      joined = joined === '' ? part : `${joined} ${part}`;
    }
  }
  return joined;
}

const MARKS = /\p{M}/gu;

const SEPARATOR = /[^\p{L}\p{N}]/u;

export function fold(text: string): string {
  return text.normalize('NFD').replace(MARKS, '').normalize('NFC').toLowerCase();
}

export function tokensOf(text: string): string[] {
  return fold(text)
    .split(/\s+/u)
    .filter((token) => token !== '');
}

export function startsAWord(folded: string, token: string): boolean {
  let at = folded.indexOf(token);
  while (at !== -1) {
    const before = folded[at - 1];
    if (before === undefined || SEPARATOR.test(before)) return true;
    at = folded.indexOf(token, at + 1);
  }
  return false;
}

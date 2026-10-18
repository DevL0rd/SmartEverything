export interface MiddleParts {
  readonly head: string;
  readonly tail: string;
}

const DOMAIN_TAIL_LABELS = 2;
const LONG_TEXT = 18;
const PLAIN_TAIL = 8;

function splitAt(text: string, index: number): MiddleParts {
  return { head: text.slice(0, index), tail: text.slice(index) };
}

export function splitMiddle(text: string): MiddleParts {
  const slash = text.lastIndexOf('/');
  if (slash >= 0) {
    return splitAt(text, slash + 1);
  }
  const labels = text.split('.');
  if (labels.length > DOMAIN_TAIL_LABELS) {
    const tail = labels.slice(-DOMAIN_TAIL_LABELS).join('.');
    return splitAt(text, text.length - tail.length);
  }
  return text.length > LONG_TEXT
    ? splitAt(text, text.length - PLAIN_TAIL)
    : splitAt(text, text.length);
}

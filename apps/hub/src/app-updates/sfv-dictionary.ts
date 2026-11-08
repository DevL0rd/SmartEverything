const MEMBER = /^([a-z*][a-z0-9_\-.*]*)="((?:[\x20\x21\x23-\x5b\x5d-\x7e]|\\["\\])*)"/u;

const SEPARATOR = /^[ \t]*,[ \t]*/u;

export class SfvDictionaryError extends Error {
  override readonly name = 'SfvDictionaryError';

  constructor(at: number) {
    super(
      `A structured header dictionary of key="string" members was expected; character ${String(at + 1)} breaks it`,
    );
  }
}

function matchAt(pattern: RegExp, text: string, at: number): RegExpExecArray | null {
  return pattern.exec(text.slice(at));
}

export function stringDictionaryOf(header: string): Readonly<Record<string, string>> {
  const text = header.trim();
  const members = new Map<string, string>();
  let at = 0;
  while (at < text.length) {
    const member = matchAt(MEMBER, text, at);
    if (member === null) throw new SfvDictionaryError(at);
    const [whole, key = '', value = ''] = member;
    members.set(key, value.replace(/\\(["\\])/gu, '$1'));
    at += whole.length;
    if (at === text.length) break;
    const separator = matchAt(SEPARATOR, text, at);
    if (separator === null || at + separator[0].length === text.length) {
      throw new SfvDictionaryError(at);
    }
    at += separator[0].length;
  }
  return Object.fromEntries(members);
}

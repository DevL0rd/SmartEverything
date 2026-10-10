export type CodeTone = 'plain' | 'keyword' | 'string' | 'number' | 'punctuation' | 'comment';

export interface CodeToken {
  readonly text: string;
  readonly tone: CodeTone;
}

const TOKEN =
  /(\/\/[^\n]*|#[^\n]*)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|\b(const|let|var|function|return|if|else|for|while|import|from|export|class|new|true|false|null|undefined|def|async|await|type|interface)\b|(-?\b\d+(?:\.\d+)?\b)|([{}[\](),:;=<>+*/-]+)/g;

const TONES: readonly CodeTone[] = ['comment', 'string', 'keyword', 'number', 'punctuation'];

function toneOf(match: RegExpMatchArray): CodeTone {
  const index = match.findIndex((group, position) => position > 0 && Boolean(group));
  return TONES[index - 1] ?? 'plain';
}

export function highlight(code: string): readonly CodeToken[] {
  const tokens: CodeToken[] = [];
  let at = 0;
  for (const match of code.matchAll(TOKEN)) {
    if (match.index > at) {
      tokens.push({ text: code.slice(at, match.index), tone: 'plain' });
    }
    tokens.push({ text: match[0], tone: toneOf(match) });
    at = match.index + match[0].length;
  }
  if (at < code.length) {
    tokens.push({ text: code.slice(at), tone: 'plain' });
  }
  return tokens;
}

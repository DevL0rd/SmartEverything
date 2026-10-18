export type CodeTone = 'plain' | 'keyword' | 'string' | 'number' | 'muted';

export interface CodeToken {
  readonly text: string;
  readonly tone: CodeTone;
}

const TOKEN =
  /(\/\/[^\n]*|#[^\n]*)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|\b(const|let|var|function|return|if|else|for|while|import|from|export|class|new|true|false|null|undefined|def|async|await|type|interface)\b|(-?\b\d+(?:\.\d+)?\b)|([{}[\](),:;=<>+*/-]+)/g;

const TONES: readonly CodeTone[] = ['muted', 'string', 'keyword', 'number', 'muted'];

function toneOf(match: RegExpMatchArray): CodeTone {
  const index = match.findIndex((group, position) => position > 0 && Boolean(group));
  return TONES[index - 1] ?? 'plain';
}

function scanned(code: string): readonly CodeToken[] {
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

function isBlank(token: CodeToken): boolean {
  return token.tone === 'plain' && token.text.trim() === '';
}

export function highlight(code: string): readonly CodeToken[] {
  const runs: CodeToken[] = [];
  let lead = '';
  for (const token of scanned(code)) {
    const last = runs.at(-1);
    if (last !== undefined && (isBlank(token) || last.tone === token.tone)) {
      runs[runs.length - 1] = { text: last.text + token.text, tone: last.tone };
    } else if (isBlank(token)) {
      lead += token.text;
    } else {
      runs.push({ text: lead + token.text, tone: token.tone });
      lead = '';
    }
  }
  return lead === '' ? runs : [{ text: lead, tone: 'plain' }];
}

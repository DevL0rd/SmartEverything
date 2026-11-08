import type { refractor, Syntax } from 'refractor/core';

export type DiffCodeTone = 'plain' | 'keyword' | 'string' | 'number' | 'comment' | 'punctuation';
export interface DiffCodeToken {
  readonly text: string;
  readonly tone: DiffCodeTone;
}
type Node = ReturnType<typeof refractor.highlight>['children'][number];
const GRAMMARS: Readonly<Record<string, () => Promise<{ readonly default: Syntax }>>> = {
  typescript: () => import('refractor/typescript'),
  tsx: () => import('refractor/tsx'),
  javascript: () => import('refractor/javascript'),
  jsx: () => import('refractor/jsx'),
  json: () => import('refractor/json'),
  markup: () => import('refractor/markup'),
  css: () => import('refractor/css'),
  markdown: () => import('refractor/markdown'),
  python: () => import('refractor/python'),
  bash: () => import('refractor/bash'),
  yaml: () => import('refractor/yaml'),
};
const MAX_CHARACTERS = 32768;
const MAX_LINES = 200;
const MAX_LINE_CHARACTERS = 2048;
const CACHE_CHARACTERS = 524288;
const CACHE_ENTRIES = 64;
const cache = new Map<string, readonly (readonly DiffCodeToken[])[]>();
const grammars = new Map<string, Promise<void>>();
const TONES = new Set<DiffCodeTone>(['keyword', 'string', 'number', 'comment', 'punctuation']);
function toneOf(names: unknown, inherited: DiffCodeTone): DiffCodeTone {
  if (!Array.isArray(names)) return inherited;
  for (const tone of TONES) if (names.includes(tone)) return tone;
  return inherited;
}
function flatten(node: Node, tone: DiffCodeTone): readonly DiffCodeToken[] {
  if (node.type === 'text') return [{ text: node.value, tone }];
  if (node.type !== 'element') return [];
  const next = toneOf(node.properties.className, tone);
  return node.children.flatMap((child) => flatten(child, next));
}
function tokenLines(
  tokens: readonly DiffCodeToken[],
  count: number,
): readonly (readonly DiffCodeToken[])[] {
  const lines: DiffCodeToken[][] = Array.from({ length: count }, () => []);
  let index = 0;
  for (const token of tokens) {
    const parts = token.text.split('\n');
    parts.forEach((text, at) => {
      if (at > 0) index += 1;
      lines[index]?.push({ text, tone: token.tone });
    });
  }
  return lines;
}
function save(key: string, value: readonly (readonly DiffCodeToken[])[]): void {
  cache.set(key, value);
  let characters = [...cache.keys()].reduce((sum, entry) => sum + entry.length, 0);
  while (cache.size > CACHE_ENTRIES || characters > CACHE_CHARACTERS) {
    const first = cache.keys().next().value;
    if (first === undefined) return;
    characters -= first.length;
    cache.delete(first);
  }
}
async function register(language: string): Promise<typeof refractor> {
  const core = await import('refractor/core');
  const load = GRAMMARS[language];
  if (load === undefined) throw new Error(`Unsupported diff grammar: ${language}`);
  let pending = grammars.get(language);
  if (pending === undefined) {
    pending = load().then((syntax) => {
      core.refractor.register(syntax.default);
    });
    grammars.set(language, pending);
  }
  await pending;
  return core.refractor;
}
export async function highlightDiffLines(
  language: string | null,
  lines: readonly string[],
): Promise<readonly (readonly DiffCodeToken[])[]> {
  const plain = lines.map((text) => [{ text, tone: 'plain' as const }]);
  const text = lines.join('\n');
  if (
    language === null ||
    lines.length > MAX_LINES ||
    text.length > MAX_CHARACTERS ||
    lines.some((line) => line.length > MAX_LINE_CHARACTERS)
  )
    return plain;
  const key = `${language}\0${text}`;
  const retained = cache.get(key);
  if (retained !== undefined) return retained;
  const engine = await register(language);
  const tokens = engine
    .highlight(text, language)
    .children.flatMap((node) => flatten(node, 'plain'));
  const result = tokenLines(tokens, lines.length);
  save(key, result);
  return result;
}

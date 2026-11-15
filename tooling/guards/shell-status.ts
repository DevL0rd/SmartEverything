export type ReadAppFile = (path: string) => string;

interface BarPart {
  readonly file: string;
  readonly name: string;
}

export const BAR_PARTS: readonly BarPart[] = [
  { file: 'src/components/page-shell/shell-actions.tsx', name: 'EditBar' },
  { file: 'src/components/page-shell/shell-actions.tsx', name: 'ShellActions' },
  { file: 'src/components/page-shell/top-shell.tsx', name: 'AppBar' },
  { file: 'src/components/page-shell/top-shell.tsx', name: 'DesktopTitleRow' },
  { file: 'src/components/page-shell/phone-frame.tsx', name: 'PhoneTop' },
  { file: 'src/components/page-shell/wide-frame.tsx', name: 'WideTitle' },
  { file: 'src/components/page-shell/wide-frame.tsx', name: 'WideTop' },
  { file: 'src/components/page-shell/shell-variants.tsx', name: 'BarRow' },
  { file: 'src/components/page-shell/shell-variants.tsx', name: 'OverlayTop' },
  { file: 'src/components/page-shell/shell-variants.tsx', name: 'OverlayShell' },
  { file: 'src/components/page-shell/shell-variants.tsx', name: 'PaneShell' },
  { file: 'src/components/page-shell/shell-status.tsx', name: 'SelectionBar' },
  { file: 'src/components/flow-frame.tsx', name: 'FlowBar' },
  { file: 'src/components/flow-frame.tsx', name: 'TouchTop' },
  { file: 'src/components/flow-frame.tsx', name: 'DialogTop' },
];

const STATUS = 'ShellStatus';

const CARRIERS: readonly string[] = [STATUS, ...new Set(BAR_PARTS.map((part) => part.name))];

const CARRIER = new RegExp(`<(?:${CARRIERS.join('|')})\\b`, 'u');

const OPTIONAL_CARRIER = new RegExp(
  `(?:\\?\\s*null\\s*:|&&)\\s*\\(?\\s*<(?:${CARRIERS.join('|')})\\b`,
  'u',
);

function closingOf(text: string, open: number, opener: string, closer: string): number {
  let depth = 0;
  for (let at = open; at < text.length; at += 1) {
    if (text[at] === opener) depth += 1;
    if (text[at] === closer) depth -= 1;
    if (depth === 0) return at;
  }
  throw new Error(`An unclosed ${opener} starts at ${String(open)}.`);
}

function bodyOf(text: string, name: string): string | null {
  const start = new RegExp(`function ${name}\\(`, 'u').exec(text);
  if (start === null) return null;
  const signature = closingOf(text, start.index + start[0].length - 1, '(', ')');
  const open = text.indexOf('{', text.indexOf(')', signature) + 1);
  return text.slice(open, closingOf(text, open, '{', '}') + 1);
}

const OPENERS: Readonly<Record<string, number>> = {
  '(': 1,
  '{': 1,
  '[': 1,
  ')': -1,
  '}': -1,
  ']': -1,
};

function statementEnd(text: string, from: number): number {
  let depth = 0;
  for (let at = from; at < text.length; at += 1) {
    const char = text.charAt(at);
    depth += OPENERS[char] ?? 0;
    if (depth < 0 || (depth === 0 && char === ';')) return at;
  }
  return text.length;
}

function returnsOf(body: string): readonly string[] {
  return [...body.matchAll(/\breturn\b/gu)].map((match) => {
    const at = match.index + match[0].length;
    return body.slice(at, statementEnd(body, at)).trim();
  });
}

export function barGaps(read: ReadAppFile): readonly string[] {
  return BAR_PARTS.flatMap(({ file, name }) => {
    const body = bodyOf(read(file), name);
    if (body === null) return [`${file}: ${name} is missing`];
    const returns = returnsOf(body);
    if (returns.length === 0) return [`${file}: ${name} draws nothing`];
    const gaps = returns
      .filter((drawn) => !CARRIER.test(drawn) || OPTIONAL_CARRIER.test(drawn))
      .map(() => `${file}: ${name} draws a bar without the status`);
    const own = name === 'ShellActions' || name === 'EditBar' || name === 'SelectionBar';
    if (own && !body.includes(`<${STATUS} />`)) gaps.push(`${file}: ${name} lacks <${STATUS} />`);
    return gaps;
  });
}

const SELECTION_FRAMES: readonly string[] = [
  'src/components/page-shell/phone-frame.tsx',
  'src/components/page-shell/wide-frame.tsx',
];

export function selectionGaps(read: ReadAppFile): readonly string[] {
  return SELECTION_FRAMES.flatMap((file) => {
    const text = read(file);
    return [...text.matchAll(/\bshell\.selection\b/gu)]
      .filter((match) => !/<SelectionBar\b[^<]*>\s*\{$/u.test(text.slice(0, match.index)))
      .map(() => `${file}: a selection head replaces the bar without the status`);
  });
}

const ROOT_LAYOUT = 'app/_layout.tsx';

const PROVIDED_AT_ROOT =
  /const SYNC_INDICATOR = <SyncIndicator \/>;[\s\S]*<HeaderStatusProvider value=\{SYNC_INDICATOR\}>\s*<Stack\b[\s\S]*<\/Stack>\s*<\/HeaderStatusProvider>/u;

export function providerGaps(read: ReadAppFile, sources: readonly string[]): readonly string[] {
  const gaps: string[] = [];
  if (!PROVIDED_AT_ROOT.test(read(ROOT_LAYOUT))) {
    gaps.push(`${ROOT_LAYOUT}: the root stack is not wrapped in the status provider`);
  }
  for (const path of sources) {
    const text = read(path);
    if (!/<HeaderStatusProvider\b/u.test(text)) continue;
    if (/\buseHeaderStatus\(\)/u.test(text) && text.includes('{outer}')) continue;
    gaps.push(`${path}: provides its own status and drops the shared indicator`);
  }
  const shell = read('src/components/page-shell/shell-types.ts');
  if (/\bbare\?:/u.test(shell))
    gaps.push('src/components/page-shell/shell-types.ts: a shell form can hide the bar');
  return gaps;
}

const SYNC_INDICATOR = 'src/app-shell/sync-indicator.tsx';

export function indicatorGaps(read: ReadAppFile): readonly string[] {
  const text = read(SYNC_INDICATOR);
  const body = bodyOf(text, 'SyncIndicator');
  if (body === null) return [`${SYNC_INDICATOR}: SyncIndicator is missing`];
  return /return null\b/u.test(text) || /:\s*SyncNotice \| null\b/u.test(text)
    ? [`${SYNC_INDICATOR}: the indicator disappears in some states`]
    : [];
}

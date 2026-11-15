import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..', '..');

const SHELL_ICONS = ['settings', 'ellipsis', 'ellipsisVertical', 'arrowLeft', 'refresh'] as const;

const OWN_CONTROL =
  /<(?:OverflowButton|PageMenu|ShellBack|[A-Z]\w*Menu(?:Button)?)\b|['"](?:panelLeft|ellipsis|ellipsisVertical|arrowLeft|settings|refresh)['"]/;

function sourceFiles(dir: string): readonly string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const FILES = sourceFiles(SRC).map((path) => ({
  path: relative(SRC, path),
  text: readFileSync(path, 'utf8'),
}));

function closingOf(text: string, open: number): number {
  let depth = 0;
  for (let at = open; at < text.length; at += 1) {
    if (text[at] === '{') depth += 1;
    if (text[at] === '}') depth -= 1;
    if (depth === 0) return at;
  }
  throw new Error(`An unclosed brace starts at ${String(open)}.`);
}

function propValues(text: string, prop: string): readonly string[] {
  const found: string[] = [];
  const pattern = new RegExp(`\\b${prop}(?:=\\{|: )`, 'g');
  for (const match of text.matchAll(pattern)) {
    const start = match.index + match[0].length;
    if (match[0].endsWith('{')) {
      found.push(text.slice(start, closingOf(text, start - 1)));
    } else {
      found.push(text.slice(start, text.indexOf('\n', start)));
    }
  }
  return found;
}

const PAIRS: Readonly<Record<string, string>> = { '{': '}', '[': ']' };

function closingPairOf(text: string, open: number): number {
  const opener = text.charAt(open);
  const closer = PAIRS[opener];
  if (closer === undefined) throw new Error(`No bracket starts at ${String(open)}.`);
  let depth = 0;
  for (let at = open; at < text.length; at += 1) {
    if (text[at] === opener) depth += 1;
    if (text[at] === closer) depth -= 1;
    if (depth === 0) return at;
  }
  throw new Error(`An unclosed bracket starts at ${String(open)}.`);
}

function shellActionBodies(text: string): readonly string[] {
  const typed = /\bShellAction(?:\[\])?\s*(?:=\s*)?([[{])/g;
  return [...text.matchAll(typed)].map((match) => {
    const open = match.index + match[0].length - 1;
    return text.slice(open, closingPairOf(text, open) + 1);
  });
}

function shellPages(): readonly { readonly path: string; readonly text: string }[] {
  return FILES.filter((file) => /<PageShell\b|<ChatPane\b/.test(file.text));
}

describe('one of each top bar control', () => {
  it('lets only the shared page menu draw the top bar overflow button', () => {
    const shellCode = FILES.filter((file) => file.path.startsWith('components/page-shell/'));
    expect(
      shellCode.filter((file) => file.text.includes('OverflowButton')).map((f) => f.path),
    ).toEqual([]);
    expect(
      FILES.filter((file) => file.text.includes('PageSettingsButton')).map((f) => f.path),
    ).toEqual([]);
  });

  it('keeps menus, back, sidebar toggles and settings out of the page trailing and leading slots', () => {
    const offenders = shellPages().flatMap((file) =>
      ['trailing', 'leading'].flatMap((prop) =>
        propValues(file.text, prop)
          .filter((value) => OWN_CONTROL.test(value))
          .map((value) => `${file.path} ${prop}: ${value.trim().slice(0, 60)}`),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it('never passes a shell owned control as a page action', () => {
    const offenders = FILES.flatMap((file) =>
      shellActionBodies(file.text).flatMap((body) =>
        SHELL_ICONS.filter((icon) => body.includes(`icon: '${icon}'`)).map(
          (icon) => `${file.path} ${icon}`,
        ),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it('gives each chat list one show and hide toggle', () => {
    const toggles = FILES.filter(
      (file) =>
        file.path.startsWith('features/assistant/') && file.text.includes("icon: 'panelLeft'"),
    ).map((file) => file.path);
    expect(toggles).toEqual(['features/assistant/screens/ai-page.tsx']);
  });

  it('keeps the file browser options in the shell menu and its view controls off a bar of their own', () => {
    const browser = FILES.filter((file) =>
      ['features/files/browser/toolbar.tsx', 'features/files/browser/file-browser.tsx'].includes(
        file.path,
      ),
    );
    expect(browser).toHaveLength(2);
    for (const file of browser) {
      expect(file.text).not.toMatch(/OverflowButton|ViewSort|Segmented|ChoiceChip/);
    }
  });
});

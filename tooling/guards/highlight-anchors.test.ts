import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applicationSource, filesUnder, insideApp } from './repository-files';

const KEYS_FILE = join(applicationSource, 'components', 'highlight-keys.ts');
const TARGETS_FILE = join(applicationSource, 'app-shell', 'highlight-targets.ts');

const kinds = [...readFileSync(KEYS_FILE, 'utf8').matchAll(/^ {2}(\w+): \(/gm)].map(
  (match) => match[1] ?? '',
);

const sources = filesUnder(applicationSource)
  .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file) && file !== KEYS_FILE)
  .map((file) => ({ file, text: readFileSync(file, 'utf8') }));

const registering = sources.filter(({ text }) => text.includes('useHighlightAnchor('));

function callsOf(text: string): readonly string[] {
  return text
    .split('useHighlightAnchor(')
    .slice(1)
    .map((rest) => rest.slice(0, rest.indexOf(');')));
}

describe('highlight anchors', () => {
  it('knows the kinds of element that can be pointed at', () => {
    expect(kinds.length).toBeGreaterThan(0);
  });

  it.each(kinds)('has a shared component that registers a %s anchor', (kind) => {
    const owners = registering.filter(({ text }) => text.includes(`anchorKey.${kind}(`));
    expect(owners.map(({ file }) => insideApp(file))).not.toEqual([]);
  });

  it.each(kinds)('lets the app view executor point at a %s anchor', (kind) => {
    expect(readFileSync(TARGETS_FILE, 'utf8')).toContain(`anchorKey.${kind}(`);
  });

  it('builds every registered key through anchorKey and spreads the result onto a view', () => {
    const offenders = registering.filter(
      ({ file, text }) =>
        !file.endsWith('use-highlight-anchor.ts') &&
        (callsOf(text).some((call) => !call.includes('anchorKey.')) ||
          !text.includes('{...anchor}')),
    );
    expect(offenders.map(({ file }) => insideApp(file))).toEqual([]);
  });
});

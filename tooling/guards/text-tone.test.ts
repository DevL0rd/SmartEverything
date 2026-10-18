import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applicationSource, filesUnder, insideApp } from './repository-files';

const toneSource = readFileSync(join(applicationSource, 'components', 'tone.ts'), 'utf8');
const toneClasses = new Set(
  [...toneSource.matchAll(/^ {2}[a-zA-Z]+: '(text-[a-z-]+)',$/gm)].map((match) => match[1] ?? ''),
);
const kitTextImport =
  /import\s*\{[^}]*\bText\b[^}]*\}\s*from\s*'(?:\.\.?\/)+(?:components\/)?text';/;
const textTag = /<Text\b[^>]*?\sclassName=(?:"([^"]*)"|\{'([^']*)'\})/g;

function conflicts(source: string): readonly string[] {
  return [...source.matchAll(textTag)].flatMap((match) =>
    (match[1] ?? match[2] ?? '').split(/\s+/).filter((name) => toneClasses.has(name)),
  );
}

describe('the kit Text colour', () => {
  it('knows the tone classes it must not be given twice', () => {
    expect(toneClasses).toContain('text-bg');
    expect(toneClasses).toContain('text-on-surface');
  });

  it('is set with the tone prop, never with a colour class that fights the tone class', () => {
    const offenders = filesUnder(applicationSource)
      .filter((file) => file.endsWith('.tsx'))
      .filter((file) => {
        const source = readFileSync(file, 'utf8');
        return kitTextImport.test(source) && conflicts(source).length > 0;
      })
      .map(insideApp);
    expect(offenders).toEqual([]);
  });

  it('finds a colour class on a kit Text in a sample', () => {
    expect(conflicts('<Text variant="caption" className="text-bg" numberOfLines={1}>')).toEqual([
      'text-bg',
    ]);
    expect(conflicts('<Text variant="caption" tone="inverse" className="px-2">')).toEqual([]);
  });
});

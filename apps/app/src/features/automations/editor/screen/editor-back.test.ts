import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const HERE = import.meta.dirname;
const FORBIDDEN = ['BackHandler', 'usePreventRemove', 'beforeRemove', 'hardwareBackPress'];

describe('Android back in the editor', () => {
  it('never intercepts the back gesture, so it always leaves the editor', () => {
    const sources = readdirSync(HERE).filter(
      (file) => /\.tsx?$/.test(file) && !file.endsWith('.test.ts'),
    );
    expect(sources.length).toBeGreaterThan(10);
    for (const file of sources) {
      const text = readFileSync(join(HERE, file), 'utf8');
      for (const word of FORBIDDEN) expect(text, `${file} uses ${word}`).not.toContain(word);
    }
  });
});

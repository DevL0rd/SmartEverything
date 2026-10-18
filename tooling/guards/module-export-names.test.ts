import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const INDEX = path.join(import.meta.dirname, '../../apps/app/modules/health-connect/index.ts');

function valueExportNames(source: string): string[] {
  return [...source.matchAll(/^export \{([^}]*)\} from/gm)].flatMap((block) =>
    (block[1] ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name !== ''),
  );
}

describe('health-connect module exports', () => {
  it('never exports the same name from two files, which breaks the web bundle on hot reload', () => {
    const names = valueExportNames(readFileSync(INDEX, 'utf8'));
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
    expect(duplicates).toEqual([]);
  });
});

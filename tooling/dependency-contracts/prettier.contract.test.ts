import { describe, expect, it } from 'vitest';
import * as prettier from 'prettier';

describe('prettier contract', () => {
  it('formats to the style the repository declares', async () => {
    const formatted = await prettier.format('const a = {b:1}', {
      parser: 'typescript',
      singleQuote: true,
      semi: true,
    });
    expect(formatted).toBe('const a = { b: 1 };\n');
  });

  it('reports whether a file is already formatted', async () => {
    expect(await prettier.check('const a = 1;\n', { parser: 'typescript' })).toBe(true);
    expect(await prettier.check('const  a=1', { parser: 'typescript' })).toBe(false);
  });
});

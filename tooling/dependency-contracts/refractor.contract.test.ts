import { describe, expect, it } from 'vitest';
import { refractor } from 'refractor/core';
import typescript from 'refractor/typescript';

describe('refractor contract', () => {
  it('registers an explicit grammar and preserves text in a HAST token tree without a document', () => {
    refractor.register(typescript);
    const tree = refractor.highlight('const count: number = 2;', 'typescript');
    expect(tree.type).toBe('root');
    expect(tree.children).toContainEqual(
      expect.objectContaining({
        type: 'element',
        properties: { className: ['token', 'keyword'] },
        children: [{ type: 'text', value: 'const' }],
      }),
    );
    expect(tree.children).toContainEqual(
      expect.objectContaining({
        type: 'element',
        properties: { className: ['token', 'number'] },
        children: [{ type: 'text', value: '2' }],
      }),
    );
  });
});

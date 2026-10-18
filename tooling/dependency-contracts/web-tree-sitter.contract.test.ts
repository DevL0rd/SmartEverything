import { describe, expect, it } from 'vitest';
import { createParser } from 'dsh-plugin-codegraph-tree-sitter/grammar';
import { languageFor } from 'dsh-plugin-codegraph-tree-sitter';

describe('web-tree-sitter contract', () => {
  it('parses a TypeScript source with the grammar the code index loads', async () => {
    const spec = languageFor('.ts');
    if (spec === undefined) throw new Error('The code index has no TypeScript language.');
    const parser = await createParser(spec);

    const tree = parser.parse('export function main(): number { return 1; }\n');

    expect(tree?.rootNode.type).toBe('program');
    expect(tree?.rootNode.hasError).toBe(false);
    expect(tree?.rootNode.firstChild?.type).toBe('export_statement');
  });

  it('reports a syntax error instead of throwing on broken source', async () => {
    const spec = languageFor('.ts');
    if (spec === undefined) throw new Error('The code index has no TypeScript language.');
    const parser = await createParser(spec);

    expect(parser.parse('export function (( {')?.rootNode.hasError).toBe(true);
  });
});

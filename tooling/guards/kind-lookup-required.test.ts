import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { filesUnder, repositoryRoot } from './repository-files';

const SOURCES = ['packages/flow/src', 'packages/domain/src', 'apps/hub/src', 'apps/app/src'];

const CORE_ONLY = new Set([
  'packages/domain/src/automation-nodes/kind-lookup.ts',
  'packages/domain/src/automation-nodes/exec-ports.ts',
  'packages/domain/src/automation-nodes/graph-kit.ts',
  'packages/domain/src/automation-v3/graph.ts',
  'packages/flow/src/graph/ops/reducer.ts',
  'apps/hub/src/store/migrations/automation-graphs.ts',
  'apps/hub/src/store/migrations/starter-custom-nodes.ts',
  'apps/app/src/features/automations/model/templates/graph-kit.ts',
  'apps/app/src/features/automations/model/fixtures/lint-context.ts',
]);

interface Source {
  readonly path: string;
  readonly file: ts.SourceFile;
}

function sources(): readonly Source[] {
  return SOURCES.flatMap((folder) =>
    filesUnder(join(repositoryRoot, folder))
      .filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$|\/test-support\//.test(path))
      .map((path) => ({
        path: relative(repositoryRoot, path).replace(/\\/g, '/'),
        file: ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true),
      })),
  );
}

function isLookupType(node: ts.TypeNode | undefined): boolean {
  return node !== undefined && /\bNodeKindLookup\b/.test(node.getText());
}

function where(source: Source, node: ts.Node): string {
  const { line } = source.file.getLineAndCharacterOfPosition(node.getStart());
  return `${source.path}:${String(line + 1)}`;
}

function optionalLookups(source: Source): readonly string[] {
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isParameter(node) && isLookupType(node.type)) {
      if (node.questionToken !== undefined || node.initializer !== undefined) {
        found.push(where(source, node));
      }
    }
    if (
      ts.isPropertySignature(node) &&
      isLookupType(node.type) &&
      node.questionToken !== undefined
    ) {
      found.push(where(source, node));
    }
    ts.forEachChild(node, visit);
  };
  visit(source.file);
  return found;
}

function coreLookups(source: Source): readonly string[] {
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && node.text === 'STATIC_KIND_LOOKUP')
      found.push(where(source, node));
    ts.forEachChild(node, visit);
  };
  visit(source.file);
  return found;
}

describe('every graph function that resolves node kinds is handed the live lookup', () => {
  const all = sources();

  it('never makes the kind lookup optional or gives it a default', () => {
    expect(all.flatMap(optionalLookups)).toEqual([]);
  });

  it('reads the core lookup only where only core kinds can exist', () => {
    const outside = all.filter((source) => !CORE_ONLY.has(source.path)).flatMap(coreLookups);
    expect(outside).toEqual([]);
  });
});

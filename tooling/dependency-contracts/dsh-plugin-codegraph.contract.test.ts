import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { Context } from '@deepseek-ai/cordis';
import Codegraph from 'dsh-plugin-codegraph-service';
import * as SqliteStore from 'dsh-plugin-codegraph-sqlite';
import * as TreeSitterIndexer from 'dsh-plugin-codegraph-tree-sitter';

const project = mkdtempSync(join(tmpdir(), 'codegraph-contract-'));
const outside = mkdtempSync(join(tmpdir(), 'codegraph-outside-'));
mkdirSync(join(project, 'src'));
writeFileSync(join(project, 'src', 'main.ts'), 'export function main(): number { return 1; }\n');
writeFileSync(join(outside, 'secret.ts'), 'export const secret = 1;\n');
symlinkSync(outside, join(project, 'linked'));
afterAll(() => {
  rmSync(project, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

async function indexedGraph(): Promise<NonNullable<Context['codegraph']>> {
  const ctx = new Context();
  await ctx.plugin(Codegraph);
  await ctx.plugin(SqliteStore, { maxOpenDatabases: 2, maxStalenessChecks: 100 });
  await ctx.plugin(TreeSitterIndexer, { watch: false });
  const service = ctx.get('codegraph');
  if (service === undefined) throw new Error('The codegraph service did not register.');
  await service.index(project);
  return service;
}

async function symbolNames(query: string): Promise<readonly string[]> {
  const service = await indexedGraph();
  const found = await service.query({
    operation: 'search',
    projectRoot: project,
    query,
    limit: 10,
  });
  return found.nodes.map((node) => node.name);
}

describe('dsh-plugin-codegraph packages (npm 0.1.6 with the SmartEverything patches)', () => {
  it('indexes a project and answers a query from the graph it wrote', async () => {
    expect(await symbolNames('main')).toContain('main');
  });

  it('does not follow a symbolic link out of the project', async () => {
    expect(await symbolNames('secret')).toStrictEqual([]);
  });
});

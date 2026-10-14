import type { Context } from '@deepseek-ai/cordis';
import { createLazyRequire } from '@deepseek-ai/dsh-lazy-require';
import type * as Codegraph from 'dsh-plugin-codegraph-service';
import type * as SqliteStore from 'dsh-plugin-codegraph-sqlite';
import type * as TreeSitterIndexer from 'dsh-plugin-codegraph-tree-sitter';
import type * as CodegraphTools from 'dsh-plugin-codegraph-tool';
import type * as CodegraphGrammar from 'dsh-plugin-codegraph-tree-sitter/grammar';
import { z } from 'zod';
import { HarnessRuntimeError } from '../host/errors';
import { verifyCodegraphPackages } from './indexer-provenance';

const loadCodegraph = createLazyRequire<typeof Codegraph>(
  'dsh-plugin-codegraph-service',
  import.meta.url,
);
const loadSqliteStore = createLazyRequire<typeof SqliteStore>(
  'dsh-plugin-codegraph-sqlite',
  import.meta.url,
);
const loadTreeSitterIndexer = createLazyRequire<typeof TreeSitterIndexer>(
  'dsh-plugin-codegraph-tree-sitter',
  import.meta.url,
);
const loadCodegraphTools = createLazyRequire<typeof CodegraphTools>(
  'dsh-plugin-codegraph-tool',
  import.meta.url,
);
const loadGrammar = createLazyRequire<typeof CodegraphGrammar>(
  'dsh-plugin-codegraph-tree-sitter/grammar',
  import.meta.url,
);

const INDEXER_CONFIG = z.strictObject({
  max_files: z.number().int().min(1).max(50_000).default(10_000),
  max_file_bytes: z.number().int().min(1).max(2_000_000).default(2_000_000),
  max_directories: z.number().int().min(1).max(10_000).default(10_000),
  concurrency: z.number().int().min(1).max(4).default(2),
});

export async function mountCodeIndexer(
  ctx: Context,
  raw: unknown,
): Promise<{ readonly dispose: () => Promise<void> }> {
  const config = INDEXER_CONFIG.parse(raw);
  await verifyCodegraphPackages();
  const codegraph = loadCodegraph();
  const store = loadSqliteStore();
  const indexer = loadTreeSitterIndexer();
  const tools = loadCodegraphTools();
  await verifyParserAndStore(indexer, loadGrammar());
  const fiber = ctx.plugin(async (scope: Context): Promise<void> => {
    await scope.plugin(codegraph.default);
    await scope.plugin(store, { maxOpenDatabases: 4, maxStalenessChecks: 2_000 });
    await scope.plugin(indexer, {
      watch: false,
      maxFiles: config.max_files,
      maxFileBytes: config.max_file_bytes,
      maxDirectories: config.max_directories,
      concurrency: config.concurrency,
    });
    await scope.plugin(tools);
  });
  try {
    await fiber;
    return { dispose: fiber.dispose };
  } catch (error) {
    await fiber.dispose();
    throw error;
  }
}

async function verifyParserAndStore(
  indexer: typeof TreeSitterIndexer,
  grammar: typeof CodegraphGrammar,
): Promise<void> {
  const { DatabaseSync } = await import('node:sqlite');
  const database = new DatabaseSync(':memory:');
  try {
    database.exec('CREATE VIRTUAL TABLE readiness USING fts5(value)');
  } finally {
    database.close();
  }
  for (const language of ['typescript', 'python']) {
    const spec = indexer.LANGUAGE_TABLE.find((entry) => entry.language === language);
    if (spec === undefined)
      throw new HarnessRuntimeError(
        'runtime_unavailable',
        `Codegraph grammar ${language} is absent.`,
      );
    await grammar.loadGrammar(spec);
  }
}

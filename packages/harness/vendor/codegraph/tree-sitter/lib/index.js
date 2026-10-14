/**
 * Self-built code-graph indexer for `ctx.codegraph`. Parses a workspace with `web-tree-sitter` and
 * `tree-sitter-wasms` and writes schema version 4 to `<projectRoot>/.codegraph/codegraph.db` — the
 * same path and format `dsh-plugin-codegraph-sqlite` reads and the external `codegraph` CLI
 * writes, so a workspace this package indexes becomes queryable through the existing store with no
 * second graph format to disagree with the first.
 *
 * Registers **only an indexer**, never a store: `ctx.codegraph.index()` runs this package, and
 * `ctx.codegraph.query()` is answered by whichever store claims the root afterward. Indexing never
 * runs implicitly from a query — it is a caller-initiated, potentially multi-minute operation, kept
 * out of the seam's read-only query path on purpose.
 *
 * Namespace plugin (named exports, no default export). Grammars load lazily, one per language, on
 * first sight of a matching file, and stay cached for the process — never eagerly for every grammar
 * this package ships with.
 * @module dsh-plugin-codegraph-tree-sitter
 */
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import z from '@deepseek-ai/schemastery';
import { CodegraphIndexerId } from 'dsh-plugin-codegraph-service';
import { LANGUAGE_TABLE } from "./languages.js";
import { walkAndExtract } from "./walk.js";
import { resolveWorkspace } from "./resolve.js";
import { writeGraph } from "./schema.js";
export { LANGUAGE_TABLE, languageFor } from "./languages.js";
export { extractFile } from "./extract.js";
export { loadGitignore, matchesGitignore, parseGitignore } from "./gitignore.js";
export { resolveWorkspace } from "./resolve.js";
export { SCHEMA_VERSION, writeGraph } from "./schema.js";
export { isExcluded, walkAndExtract } from "./walk.js";
export { createWatcher, nodeWatch } from "./watcher.js";
export { decideWatch, readProcVersion } from "./watch-policy.js";
/** Cordis plugin name for loader diagnostics. */
export const name = 'codegraph-tree-sitter';
/** Services required by this plugin. */
export const inject = ['codegraph'];
/** Path of the on-disk graph this package writes, relative to a project root. */
export const DATABASE_RELATIVE_PATH = '.codegraph/codegraph.db';
/** Default branded identity this indexer reserves on the seam. */
export const DEFAULT_INDEXER_ID = 'codegraph-tree-sitter';
/**
 * Directory segments never descended into by default. Includes this package's own `.codegraph`
 * output — without it, a watcher would treat its own `writeGraph()` as an in-scope change and
 * rebuild forever.
 */
export const DEFAULT_EXCLUDE = ['node_modules', 'dist', 'build', 'coverage', '.git', '.codegraph'];
/** Default ceiling on a single file's size before it is skipped. */
export const DEFAULT_MAX_FILE_BYTES = 2_000_000;
/** Default ceiling on how many files one run indexes. */
export const DEFAULT_MAX_FILES = 50_000;
/** Default number of files parsed concurrently. */
export const DEFAULT_CONCURRENCY = 4;
/** Default quiet period after the last change before a watch-triggered refresh runs. */
export const DEFAULT_WATCH_DEBOUNCE_MS = 2_000;
/** Default cap on directories watched individually, on platforms without a recursive `fs.watch`. */
export const DEFAULT_MAX_WATCHED_DIRECTORIES = 4_000;
export const Config = z.object({
    indexerId: z.string().default(DEFAULT_INDEXER_ID),
    languages: z.array(z.string()).default([...new Set(LANGUAGE_TABLE.map(spec => spec.language))]),
    exclude: z.array(z.string()).default(DEFAULT_EXCLUDE),
    respectGitignore: z.boolean().default(true),
    maxFileBytes: z.number().default(DEFAULT_MAX_FILE_BYTES),
    maxFiles: z.number().default(DEFAULT_MAX_FILES),
    maxDirectories: z.number().default(10000),
    concurrency: z.number().default(DEFAULT_CONCURRENCY),
    watch: z.boolean().default(true),
    watchDebounceMs: z.number().default(DEFAULT_WATCH_DEBOUNCE_MS),
    maxWatchedDirectories: z.number().default(DEFAULT_MAX_WATCHED_DIRECTORIES),
});
/**
 * Register the tree-sitter indexer.
 * @param ctx - the plugin context (must inject `codegraph`).
 * @param config - the resolved plugin configuration.
 */
export function apply(ctx, config) {
    const resolved = config;
    if (resolved.watch) throw new Error('Policy-confined codegraph indexing requires watch:false; refresh explicitly.');
    assertPositiveInteger('maxFileBytes', resolved.maxFileBytes);
    assertPositiveInteger('maxFiles', resolved.maxFiles);
    assertPositiveInteger('maxDirectories', resolved.maxDirectories);
    assertPositiveInteger('concurrency', resolved.concurrency);
    assertPositiveInteger('watchDebounceMs', resolved.watchDebounceMs);
    assertPositiveInteger('maxWatchedDirectories', resolved.maxWatchedDirectories);
    const indexer = {
        id: CodegraphIndexerId(resolved.indexerId),
        async canIndex(projectRoot) {
            try {
                return (await stat(projectRoot)).isDirectory();
            }
            catch {
                // Only the existence probe runs in the try. Any rejection — missing path, or no permission
                // to look — means this indexer cannot build a graph here, which is the answer the seam asked
                // for rather than a failure to report.
                return false;
            }
        },
        async index(projectRoot, signal) {
            const report = await runIndex(projectRoot, resolved, signal);
            // Watching starts only after a successful index establishes the baseline it refreshes — never
            // from a canIndex() probe or a failed run.
            return report;
        },
    };
    ctx.codegraph.registerIndexer(indexer);
}
/**
 * One indexing run: walk, parse, resolve, and write.
 * @param projectRoot - absolute path of the workspace to index.
 * @param config - the resolved plugin configuration.
 * @param signal - aborts the run.
 * @returns the run's report.
 */
async function runIndex(projectRoot, config, signal) {
    const { files, filesSkipped } = await walkAndExtract(projectRoot, {
        exclude: config.exclude,
        respectGitignore: config.respectGitignore,
        maxFileBytes: config.maxFileBytes,
        maxFiles: config.maxFiles,
        maxDirectories: config.maxDirectories,
        concurrency: config.concurrency,
        languages: config.languages,
    }, signal);
    signal?.throwIfAborted();
    const indexedAt = Date.now();
    const graph = resolveWorkspace(files, indexedAt);
    signal?.throwIfAborted();
    const databasePath = join(projectRoot, DATABASE_RELATIVE_PATH);
    await writeGraph(databasePath, { files, nodes: graph.nodes, edges: graph.edges, unresolved: graph.unresolved, indexedAt }, signal);
    const languageCounts = new Map();
    for (const file of files)
        languageCounts.set(file.language, (languageCounts.get(file.language) ?? 0) + 1);
    const languages = [...languageCounts.entries()]
        .map(([language, fileCount]) => ({ language, fileCount }))
        .sort((left, right) => right.fileCount - left.fileCount || left.language.localeCompare(right.language));
    return {
        projectRoot,
        filesIndexed: files.length,
        filesSkipped,
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
        unresolvedCount: graph.unresolved.length,
        unresolvedLikelyInternalCount: graph.unresolved.filter(ref => !ref.likelyExternal).length,
        languages,
    };
}
/** Reject a non-positive-integer config value at load, so misconfiguration fails loud. */
function assertPositiveInteger(field, value) {
    if (!Number.isInteger(value) || value < 1) {
        throw new Error(`codegraph-tree-sitter: ${field} must be a positive integer`);
    }
}
//# sourceMappingURL=index.js.map
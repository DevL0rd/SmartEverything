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
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
export { LANGUAGE_TABLE, languageFor } from './languages.ts';
export type { DefinitionRule, ImportRule, LanguageSpec } from './languages.ts';
export { extractFile } from './extract.ts';
export type { FileExtraction, RawCall, RawDefinition, RawImport } from './extract.ts';
export { loadGitignore, matchesGitignore, parseGitignore } from './gitignore.ts';
export type { GitignoreRule } from './gitignore.ts';
export { resolveWorkspace } from './resolve.ts';
export type { ExtractedFile, GraphEdge, GraphNode, ResolvedGraph, UnresolvedRef } from './resolve.ts';
export { SCHEMA_VERSION, writeGraph } from './schema.ts';
export { isExcluded, walkAndExtract } from './walk.ts';
export type { WalkConfig, WalkResult } from './walk.ts';
export { createWatcher, nodeWatch } from './watcher.ts';
export type { DegradeReason, WatchConfig, WatchHandle, WatchPrimitive, Watcher } from './watcher.ts';
export { decideWatch, readProcVersion } from './watch-policy.ts';
export type { WatchDecision, WatchPolicyInput } from './watch-policy.ts';
/** Cordis plugin name for loader diagnostics. */
export declare const name = "codegraph-tree-sitter";
/** Services required by this plugin. */
export declare const inject: string[];
/** Path of the on-disk graph this package writes, relative to a project root. */
export declare const DATABASE_RELATIVE_PATH = ".codegraph/codegraph.db";
/** Default branded identity this indexer reserves on the seam. */
export declare const DEFAULT_INDEXER_ID = "codegraph-tree-sitter";
/**
 * Directory segments never descended into by default. Includes this package's own `.codegraph`
 * output — without it, a watcher would treat its own `writeGraph()` as an in-scope change and
 * rebuild forever.
 */
export declare const DEFAULT_EXCLUDE: string[];
/** Default ceiling on a single file's size before it is skipped. */
export declare const DEFAULT_MAX_FILE_BYTES = 2000000;
/** Default ceiling on how many files one run indexes. */
export declare const DEFAULT_MAX_FILES = 50000;
/** Default number of files parsed concurrently. */
export declare const DEFAULT_CONCURRENCY = 4;
/** Default quiet period after the last change before a watch-triggered refresh runs. */
export declare const DEFAULT_WATCH_DEBOUNCE_MS = 2000;
/** Default cap on directories watched individually, on platforms without a recursive `fs.watch`. */
export declare const DEFAULT_MAX_WATCHED_DIRECTORIES = 4000;
/** Plugin configuration: the indexer's identity and every deployment-varying bound on a run. */
export interface Config {
    /**
     * Branded identity to reserve on `ctx.codegraph`. Give each instance its own id when mounting more
     * than one, so a duplicate registration fails at load instead of shadowing the first indexer.
     */
    indexerId?: string;
    /** Restrict indexing to these seam language labels when set (default: every grammar this package ships). */
    languages?: string[];
    /** Directory segment names never descended into (default: node_modules, dist, build, coverage, .git). */
    exclude?: string[];
    /**
     * Also exclude whatever the project root's `.gitignore` names, unioned with `exclude` (default
     * true). Build tooling routinely writes compiled output to a gitignored directory outside the
     * default exclude list (`lib`, `out`, ...); indexing that output alongside its own source hands the
     * resolver two same-named declarations of one symbol and makes "the one unique workspace-wide name
     * wins" pick between them arbitrarily. Only a practical subset of gitignore syntax is understood —
     * see `./gitignore.ts`. A project with no root `.gitignore` is unaffected either way.
     */
    respectGitignore?: boolean;
    /** Files larger than this are skipped and counted in the report, never parsed (default 2000000). */
    maxFileBytes?: number;
    /** The walk stops discovering new files once this many have been found (default 50000). */
    maxFiles?: number;
    maxDirectories?: number;
    /** Files parsed concurrently (default 4). */
    concurrency?: number;
    /**
     * Watch the workspace for file changes and refresh the index automatically after a successful
     * `index()` call establishes a baseline (default true). Set `watch: false` to keep indexing purely
     * explicit instead.
     *
     * Overridden off by default on a WSL2 kernel watching a path mounted in from the Windows host
     * (`/mnt/<drive>/...`), since inotify does not reliably deliver events over that 9P mount — see
     * `watch-policy.ts`. Set `CODEGRAPH_FORCE_WATCH=1` to watch there anyway, or `CODEGRAPH_NO_WATCH=1`
     * to force watching off everywhere regardless of this option.
     */
    watch?: boolean;
    /** Quiet period after the last change before a watch-triggered refresh runs, in ms (default 2000). */
    watchDebounceMs?: number;
    /**
     * Hard cap on directories watched individually (default 4000). Only relevant on platforms without a
     * recursive `fs.watch` (Linux); exceeding it degrades that root's watcher rather than covering only
     * part of the tree.
     */
    maxWatchedDirectories?: number;
}
export declare const Config: z<Config>;
/**
 * Register the tree-sitter indexer.
 * @param ctx - the plugin context (must inject `codegraph`).
 * @param config - the resolved plugin configuration.
 */
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=index.d.ts.map
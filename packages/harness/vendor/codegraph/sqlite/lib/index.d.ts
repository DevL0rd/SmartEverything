/**
 * SQLite graph store for `ctx.codegraph`. One plugin instance registers one store that answers every
 * seam operation from the on-disk knowledge graph an external `codegraph` indexer writes to
 * `<projectRoot>/.codegraph/codegraph.db`, opening each project read-only and keeping a bounded set
 * of connections warm.
 *
 * The store is host-local by construction: `node:sqlite` opens a path on the machine running the
 * harness, so availability is decided against the host filesystem rather than `ctx.fs`. A workspace
 * that lives in a remote sandbox is not served by this store even when `ctx.fs` can read its files —
 * reporting availability from `ctx.fs` would claim a root the store then fails to open.
 *
 * Namespace plugin (named exports, no default export). Lifecycle is effect-scoped: disposal
 * unregisters from `ctx.codegraph` first, then closes every open connection.
 * @module dsh-plugin-codegraph-sqlite
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
export { DATABASE_RELATIVE_PATH, GraphPool, SUPPORTED_FORMAT_VERSION, databasePath, openGraph, } from './database.ts';
export { toEdge, toFile, toNode } from './rows.ts';
export { ftsPhrase, likeAnywhere } from './sql.ts';
export { walkImpact, walkTrace, type ImpactHit, type ImpactWalk, type Step, type TraceWalk } from './traverse.ts';
/** Cordis plugin name for loader diagnostics. */
export declare const name = "codegraph-sqlite";
/** Services required by this plugin. */
export declare const inject: string[];
/** Default branded identity this store reserves on the seam. */
export declare const DEFAULT_STORE_ID = "codegraph-sqlite";
/** Default number of project databases kept open at once. */
export declare const DEFAULT_MAX_OPEN_DATABASES = 4;
/** Default ceiling on distinct nodes one `impact` or `trace` walk may visit. */
export declare const DEFAULT_MAX_TRAVERSAL_NODES = 20000;
/** Default ceiling on indexed files one `status` call stats on the host filesystem for freshness. */
export declare const DEFAULT_MAX_STALENESS_CHECKS = 2000;
/** Plugin configuration: store identity and the bounds the seam's requests cannot express. */
export interface Config {
    /**
     * Branded identity to reserve on `ctx.codegraph`. Give each instance its own id when mounting
     * more than one, so a duplicate registration fails at load instead of shadowing the first store.
     */
    storeId?: string;
    /**
     * Largest number of project databases held open at once (default 4). The least recently queried
     * connection closes when the limit is exceeded; a project queried again simply reopens.
     */
    maxOpenDatabases?: number;
    /**
     * Largest number of distinct nodes one `impact` or `trace` walk may visit (default 20000). A
     * request's `depth`, `limit`, and `maxPaths` bound the answer; this bounds the work, so a query
     * against a large monorepo returns a truncated answer instead of running unboundedly.
     */
    maxTraversalNodes?: number;
    /**
     * Largest number of indexed files one `status` call stats on the host filesystem to detect
     * staleness (default 2000). A repository indexing more files than this gets a lower-bound stale
     * count instead of a `status` call that stats every file it ever indexed.
     */
    maxStalenessChecks?: number;
}
export declare const Config: z<Config>;
/**
 * Register the SQLite graph store.
 * @param ctx - the plugin context (must inject `codegraph`).
 * @param config - the resolved plugin configuration.
 */
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=index.d.ts.map
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
import { access } from 'node:fs/promises';
import z from '@deepseek-ai/schemastery';
import { CodegraphStoreId } from 'dsh-plugin-codegraph-service';
import { assertNever } from '@deepseek-ai/dsh-util-values';
import { GraphPool, databasePath } from "./database.js";
import { files, impact, node, relations, search, status, trace } from "./queries.js";
import { walkImpact, walkTrace } from "./traverse.js";
export { DATABASE_RELATIVE_PATH, GraphPool, SUPPORTED_FORMAT_VERSION, databasePath, openGraph, } from "./database.js";
export { toEdge, toFile, toNode } from "./rows.js";
export { ftsPhrase, likeAnywhere } from "./sql.js";
export { walkImpact, walkTrace } from "./traverse.js";
/** Cordis plugin name for loader diagnostics. */
export const name = 'codegraph-sqlite';
/** Services required by this plugin. */
export const inject = ['codegraph'];
/** Default branded identity this store reserves on the seam. */
export const DEFAULT_STORE_ID = 'codegraph-sqlite';
/** Default number of project databases kept open at once. */
export const DEFAULT_MAX_OPEN_DATABASES = 4;
/** Default ceiling on distinct nodes one `impact` or `trace` walk may visit. */
export const DEFAULT_MAX_TRAVERSAL_NODES = 20_000;
/** Default ceiling on indexed files one `status` call stats on the host filesystem for freshness. */
export const DEFAULT_MAX_STALENESS_CHECKS = 2_000;
export const Config = z.object({
    storeId: z.string().default(DEFAULT_STORE_ID),
    maxOpenDatabases: z.number().default(DEFAULT_MAX_OPEN_DATABASES),
    maxTraversalNodes: z.number().default(DEFAULT_MAX_TRAVERSAL_NODES),
    maxStalenessChecks: z.number().default(DEFAULT_MAX_STALENESS_CHECKS),
});
/**
 * Register the SQLite graph store.
 * @param ctx - the plugin context (must inject `codegraph`).
 * @param config - the resolved plugin configuration.
 */
export function apply(ctx, config) {
    const resolved = config;
    assertPositiveInteger('maxOpenDatabases', resolved.maxOpenDatabases);
    assertPositiveInteger('maxTraversalNodes', resolved.maxTraversalNodes);
    assertPositiveInteger('maxStalenessChecks', resolved.maxStalenessChecks);
    const pool = new GraphPool(resolved.maxOpenDatabases);
    const store = {
        id: CodegraphStoreId(resolved.storeId),
        async indexes(projectRoot) {
            try {
                await access(databasePath(projectRoot));
                return true;
            }
            catch {
                // Only the existence probe runs in the try. Any rejection — missing file, missing
                // directory, or no permission to look — means this store cannot serve the root, which is
                // the answer the seam asked for rather than a failure to report.
                return false;
            }
        },
        query(request) {
            return Promise.resolve(run(pool, resolved, request));
        },
    };
    ctx.effect(function* () {
        // Registered first, so it disposes LAST: the store unregisters before its connections close,
        // and no query can be routed to a pool that is already shut.
        yield () => {
            pool.close();
        };
        yield ctx.codegraph.registerStore(store);
    }, 'codegraph-sqlite');
}
/**
 * Answer one request from the pooled connection for its project root.
 * @param pool - the store's connection pool.
 * @param config - the resolved plugin configuration.
 * @param request - the normalized seam request.
 * @returns the result member matching `request.operation`.
 */
function run(pool, config, request) {
    const db = pool.acquire(request.projectRoot);
    switch (request.operation) {
        case 'search':
            return search(db, request);
        case 'node':
            return node(db, request);
        case 'callers':
        case 'callees':
            return relations(db, request);
        case 'impact':
            return impact(db, request, (origin, depth) => walkImpact(db, origin, depth, config.maxTraversalNodes));
        case 'trace':
            return trace(db, request, (from, to, maxDepth, maxPaths) => walkTrace(db, from, to, maxDepth, maxPaths, config.maxTraversalNodes));
        case 'files':
            return files(db, request);
        case 'status':
            return status(db, request.projectRoot, config.maxStalenessChecks);
        /* v8 ignore next -- exhaustive over the seam's closed operation union; unreachable. */
        default:
            return assertNever(request, 'codegraph-sqlite request');
    }
}
/** Reject a non-positive-integer config value at load, so misconfiguration fails loud. */
function assertPositiveInteger(field, value) {
    if (!Number.isInteger(value) || value < 1) {
        throw new Error(`codegraph-sqlite: ${field} must be a positive integer`);
    }
}
//# sourceMappingURL=index.js.map
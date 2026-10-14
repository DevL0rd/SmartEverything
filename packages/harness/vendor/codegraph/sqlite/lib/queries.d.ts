/**
 * The eight seam operations against one open graph database. Every function here is synchronous:
 * `node:sqlite` is a synchronous binding, so a query either completes within one turn or throws,
 * and the store's async surface exists for the seam's contract rather than for I/O interleaving.
 * @module dsh-plugin-codegraph-sqlite/queries
 */
import type { DatabaseSync } from 'node:sqlite';
import type { CodegraphCalleesRequest, CodegraphCallersRequest, CodegraphFilesRequest, CodegraphFilesResult, CodegraphImpactRequest, CodegraphImpactResult, CodegraphNodeRequest, CodegraphNodeResult, CodegraphRelationsResult, CodegraphSearchRequest, CodegraphSearchResult, CodegraphStatusResult, CodegraphTraceRequest, CodegraphTraceResult } from 'dsh-plugin-codegraph-service';
import type { ImpactWalk, TraceWalk } from './traverse.ts';
/**
 * Find declarations matching a free-text query.
 * @param db - the open graph connection.
 * @param request - the search query with its resolved bounds.
 * @returns the matching declarations, most relevant first, with the pre-limit total.
 */
export declare function search(db: DatabaseSync, request: CodegraphSearchRequest): CodegraphSearchResult;
/**
 * Resolve one symbol and read its immediate neighbourhood.
 * @param db - the open graph connection.
 * @param request - the node query with its resolved bounds.
 * @returns the resolved declaration with its one-hop relations, or a null subject when the name
 * matches nothing.
 */
export declare function node(db: DatabaseSync, request: CodegraphNodeRequest): CodegraphNodeResult;
/**
 * Find the declarations that call, or are called by, one symbol.
 * @param db - the open graph connection.
 * @param request - the callers or callees query; its operation picks the direction walked.
 * @returns the distinct related declarations with their earliest call sites and repeat counts.
 */
export declare function relations(db: DatabaseSync, request: CodegraphCallersRequest | CodegraphCalleesRequest): CodegraphRelationsResult;
/**
 * Walk dependents transitively.
 * @param db - the open graph connection.
 * @param request - the impact query.
 * @param walk - the reverse-reachability walk, injected so the traversal budget stays with the
 * plugin that configures it.
 * @returns the affected declarations, nearest first.
 */
export declare function impact(db: DatabaseSync, request: CodegraphImpactRequest, walk: ImpactWalk): CodegraphImpactResult;
/**
 * Find shortest directed paths between two symbols.
 * @param db - the open graph connection.
 * @param request - the trace query.
 * @param walk - the shortest-path sweep, injected so the traversal budget stays with the plugin that
 * configures it.
 * @returns the paths, each as ordered hops from origin to destination.
 */
export declare function trace(db: DatabaseSync, request: CodegraphTraceRequest, walk: TraceWalk): CodegraphTraceResult;
/**
 * List indexed files under an optional subtree and glob.
 * @param db - the open graph connection.
 * @param request - the files query with its resolved bounds.
 * @returns the matching files ordered by path, with the pre-limit total.
 */
export declare function files(db: DatabaseSync, request: CodegraphFilesRequest): CodegraphFilesResult;
/**
 * Report index size, language coverage, and freshness.
 * @param db - the open graph connection.
 * @param projectRoot - the project root the result echoes back, since the graph does not record it.
 * @param maxStalenessChecks - largest number of indexed files to stat on the host filesystem when
 * looking for drift, so a call against a very large index stays cheap.
 * @returns the index summary.
 */
export declare function status(db: DatabaseSync, projectRoot: string, maxStalenessChecks: number): CodegraphStatusResult;
//# sourceMappingURL=queries.d.ts.map
/**
 * Graph walks over the `edges` table: the reverse reachability that answers `impact` and the
 * shortest-path enumeration that answers `trace`.
 *
 * Both walks are breadth-first and bounded by a visit budget, because a request's `depth`, `limit`,
 * and `maxPaths` bound the ANSWER while the graph decides the WORK — an unbounded walk on a large
 * monorepo would run long before it had anything to truncate.
 * @module dsh-plugin-codegraph-sqlite/traverse
 */
import type { DatabaseSync } from 'node:sqlite';
import type { CodegraphNodeId } from 'dsh-plugin-codegraph-service';
/** One traversal step: the node reached and the edge that reached it. */
export interface Step {
    /** The node this step reaches. */
    readonly node: CodegraphNodeId;
    /** The edge traversed, as its endpoint ids, kind, and site. */
    readonly edge: {
        readonly source: CodegraphNodeId;
        readonly target: CodegraphNodeId;
        readonly kind: string;
        readonly line?: number;
        readonly column?: number;
    };
}
/** One node reached by {@link walkImpact}, with how far and by what relationship. */
export interface ImpactHit {
    /** The affected node. */
    readonly node: CodegraphNodeId;
    /** Hops from the origin; `1` is a direct dependent. */
    readonly distance: number;
    /** The relationship kind on the shortest walk that reached it. */
    readonly via: string;
}
/**
 * The reverse-reachability walk as `impact` receives it. Injected rather than called directly so the
 * traversal budget stays with the plugin that configures it.
 */
export type ImpactWalk = (origin: CodegraphNodeId, depth: number) => {
    hits: ImpactHit[];
    exhausted: boolean;
};
/** The shortest-path sweep as `trace` receives it, injected for the same reason. */
export type TraceWalk = (from: CodegraphNodeId, to: CodegraphNodeId, maxDepth: number, maxPaths: number) => Step[][];
/**
 * Everything that transitively depends on one node, nearest first.
 * @param db - the open graph connection.
 * @param origin - the node being changed.
 * @param depth - largest number of hops to walk.
 * @param budget - largest number of distinct nodes to visit before stopping the walk.
 * @returns the affected nodes in nondecreasing distance order, and whether the budget stopped the
 * walk before it ran out of graph.
 */
export declare function walkImpact(db: DatabaseSync, origin: CodegraphNodeId, depth: number, budget: number): {
    hits: ImpactHit[];
    exhausted: boolean;
};
/**
 * Shortest directed paths between two nodes.
 *
 * Only shortest paths are returned: the breadth-first sweep records, for each node, the edges that
 * first reached it, so backtracking from the destination enumerates every route of that minimum
 * length and no longer detour. A longer path that avoids a shared intermediate hop is not reported.
 * @param db - the open graph connection.
 * @param from - the origin node.
 * @param to - the destination node.
 * @param maxDepth - largest number of hops a returned path may contain.
 * @param maxPaths - largest number of paths to enumerate.
 * @param budget - largest number of distinct nodes to visit before stopping the sweep.
 * @returns each path as its ordered steps, shortest first; empty when no path exists within the
 * depth and budget.
 */
export declare function walkTrace(db: DatabaseSync, from: CodegraphNodeId, to: CodegraphNodeId, maxDepth: number, maxPaths: number, budget: number): Step[][];
//# sourceMappingURL=traverse.d.ts.map
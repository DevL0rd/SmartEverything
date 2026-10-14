/**
 * The two operations that are not seam queries. `explore` and `context` compose the graph primitives
 * with `ctx.fs` reads, which is why they live in the consumer: a graph store returns positions and
 * cannot reach a remote workspace's bytes, so aggregation belongs to the role that holds both.
 * @module dsh-plugin-codegraph-tool/compose
 */
import type { CodegraphNode, CodegraphRelation } from 'dsh-plugin-codegraph-service';
/**
 * Split a task description into the terms worth searching for.
 *
 * A task is prose, but a graph is indexed by identifiers, so the terms that carry signal are the
 * identifier-shaped words: `camelCase` and `snake_case` names survive whole because splitting them
 * would search for their fragments instead of the symbol the author meant.
 * @param task - the free-text task description.
 * @param maxTerms - largest number of terms to return.
 * @returns the search terms, longest first so the most specific one is searched before the budget
 * runs out.
 */
export declare function taskTerms(task: string, maxTerms: number): string[];
/**
 * Keep only the declarations among matched nodes.
 * @param nodes - the matched nodes.
 * @returns the nodes that declare something.
 */
export declare function declarationsOnly(nodes: readonly CodegraphNode[]): CodegraphNode[];
/** A node with the evidence that it matched. */
export interface ScoredNode {
    /** The matched declaration. */
    readonly node: CodegraphNode;
    /** How many distinct terms found it. */
    readonly hits: number;
}
/**
 * Merge per-term search results into one ranked list.
 *
 * A declaration found by several of a task's terms is more likely to be what the task is about than
 * one found by a single term, so hit count leads the ranking; within an equal count the earliest
 * position any single search gave it wins, preserving the store's own relevance order.
 * @param batches - each term's search results, in the order the store ranked them.
 * @param limit - largest number of declarations to return.
 * @returns the merged declarations, most relevant first.
 */
export declare function mergeByHits(batches: readonly (readonly CodegraphNode[])[], limit: number): ScoredNode[];
/** Declarations that share one file, in the order the search ranked them. */
export interface FileGroup {
    /** The file, relative to the project root. */
    readonly path: string;
    /** The matched declarations in that file. */
    readonly nodes: CodegraphNode[];
    /** One-based first line spanned by {@link nodes}. */
    readonly startLine: number;
    /** One-based last line spanned by {@link nodes}. */
    readonly endLine: number;
}
/**
 * Group ranked declarations by file, preserving rank.
 *
 * Grouping is what makes `explore` cheaper than reading each symbol separately: several matches in
 * one file share a single read and a single contiguous slice, and the file that held the top-ranked
 * match is presented first.
 * @param nodes - the ranked declarations.
 * @param maxFiles - largest number of files to return.
 * @returns the groups, best-ranked file first.
 */
export declare function groupByFile(nodes: readonly CodegraphNode[], maxFiles: number): FileGroup[];
/**
 * Merge relations from several symbols, keeping each related declaration once.
 * @param batches - relation lists to merge.
 * @param limit - largest number of relations to return.
 * @returns the merged relations, in first-seen order.
 */
export declare function mergeRelations(batches: readonly (readonly CodegraphRelation[])[], limit: number): CodegraphRelation[];
//# sourceMappingURL=compose.d.ts.map
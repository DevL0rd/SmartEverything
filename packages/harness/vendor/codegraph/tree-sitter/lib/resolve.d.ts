/**
 * Workspace-wide, two-pass call resolution over every file's raw extraction.
 *
 * Pass 1 collects every definition into a name index. Pass 2 resolves each call site's callee name,
 * in order: (1) the enclosing file imports that name from a relative specifier resolving to a file
 * this run indexed — that file's matching declaration wins; (2) otherwise exactly one definition
 * workspace-wide carries the name — it wins; (3) otherwise the call is recorded in `unresolved` and no
 * `calls` edge is written. An ambiguous edge is worse than a missing one: the model acts on `callers`
 * output, so a confidently wrong caller sends it to edit the wrong file, while a missing caller merely
 * sends it back to text search.
 *
 * Rule 3's `unresolved` entries are not one uniform signal. Each carries {@link UnresolvedRef.likelyExternal},
 * which is true for a member call (no type information behind its receiver) or a name the file itself
 * imports (a known external origin the specifier just didn't resolve) — both real code that was never a
 * candidate for a workspace edge, as against a bare, undeclared name, which is the actual gap this
 * resolver's conservative rule leaves behind.
 * @module dsh-plugin-codegraph-tree-sitter/resolve
 */
import type { FileExtraction } from './extract.ts';
/** One file's extraction, positioned in the workspace. */
export interface ExtractedFile {
    /** Project-relative path, forward-slash separated. */
    readonly path: string;
    readonly language: string;
    readonly size: number;
    readonly modifiedAt: number;
    /** SHA-256 of the file's content, hex-encoded. */
    readonly contentHash: string;
    /** Total line count, for the synthetic file node's span. */
    readonly lineCount: number;
    readonly extraction: FileExtraction;
}
/** One resolved graph node — a file or a declaration. */
export interface GraphNode {
    readonly id: string;
    readonly kind: string;
    readonly name: string;
    readonly qualifiedName: string;
    readonly filePath: string;
    readonly language: string;
    readonly startLine: number;
    readonly endLine: number;
    readonly startColumn: number;
    readonly endColumn: number;
    readonly isExported: boolean;
    readonly isAsync: boolean;
    readonly isStatic: boolean;
    /** Decorator names applied to this declaration — see `RawDefinition.decorators`. Empty for a file
     * node and for every declaration this package does not currently extract decorators from. */
    readonly decorators: readonly string[];
    readonly updatedAt: number;
}
/** One resolved graph edge. */
export interface GraphEdge {
    readonly source: string;
    readonly target: string;
    readonly kind: string;
    readonly line?: number;
    readonly col?: number;
    readonly provenance: string;
}
/** One call site whose callee could not be resolved to exactly one declaration. */
export interface UnresolvedRef {
    readonly source: string;
    readonly filePath: string;
    readonly calleeName: string;
    readonly line: number;
    readonly col: number;
    /**
     * Whether this site's own shape makes a workspace declaration structurally unlikely, rather than
     * merely unresolved: a member access (`x.map()`, `expect(v).toBe()`) has no type information behind
     * its receiver, and a bare name the file itself imports (`import { expect } from 'vitest'`) already
     * has a known, non-workspace origin even though the specifier never resolved to an indexed file.
     * Neither is a gap in the graph — both are real code that was never a candidate for a workspace edge
     * — so a caller sizing "how much did resolution miss" should discount them.
     */
    readonly likelyExternal: boolean;
}
/** The resolved workspace graph. */
export interface ResolvedGraph {
    readonly nodes: GraphNode[];
    readonly edges: GraphEdge[];
    readonly unresolved: UnresolvedRef[];
}
/**
 * Resolve every file's raw extraction into the workspace graph.
 * @param files - every file this run parsed, with its raw extraction.
 * @param now - epoch milliseconds recorded as every node's `updatedAt`.
 * @returns the resolved nodes, edges, and unresolved call sites.
 */
export declare function resolveWorkspace(files: readonly ExtractedFile[], now: number): ResolvedGraph;
//# sourceMappingURL=resolve.d.ts.map
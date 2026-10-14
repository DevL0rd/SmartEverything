/**
 * Seam records to model-facing values. The tool owns this projection because the seam's vocabulary
 * describes a graph while the model's describes code: `filePath`/`startLine` become `path`/`line`,
 * an edge's kind becomes `via`, and the fields a model cannot act on — opaque node ids, index
 * timestamps, provenance — are dropped rather than spent as tokens.
 * @module dsh-plugin-codegraph-tool/projection
 */
import type { CodegraphImpactEntry, CodegraphNode, CodegraphRelation, CodegraphTraceHop } from 'dsh-plugin-codegraph-service';
/** Caps applied while projecting, so one enormous doc comment cannot dominate a result. */
export interface ProjectionLimits {
    /** Largest documentation string carried per symbol, in characters. */
    readonly maxDocstringChars: number;
    /** Largest signature carried per symbol, in characters. */
    readonly maxSignatureChars: number;
}
/** The model-facing shape of one declaration. */
export interface SymbolView {
    readonly name: string;
    readonly qualified_name: string;
    readonly kind: string;
    readonly path: string;
    readonly line: number;
    readonly end_line: number;
    readonly language: string;
    readonly exported: boolean;
    readonly signature?: string;
    readonly docstring?: string;
}
/**
 * Project one declaration.
 * @param node - the seam's node record.
 * @param limits - the caps to apply to free text.
 * @returns the model-facing symbol.
 */
export declare function toSymbol(node: CodegraphNode, limits: ProjectionLimits): SymbolView;
/** A symbol plus how it was reached. */
export interface RelationView extends SymbolView {
    readonly via: string;
    readonly site_line?: number;
    readonly site_count: number;
}
/**
 * Project one related declaration.
 * @param relation - the seam's relation record.
 * @param limits - the caps to apply to free text.
 * @returns the model-facing relation.
 */
export declare function toRelation(relation: CodegraphRelation, limits: ProjectionLimits): RelationView;
/** A symbol reached by a transitive walk. */
export interface AffectedView extends SymbolView {
    readonly via: string;
    readonly distance: number;
}
/**
 * Project one impact entry.
 * @param entry - the seam's impact record.
 * @param limits - the caps to apply to free text.
 * @returns the model-facing affected symbol.
 */
export declare function toAffected(entry: CodegraphImpactEntry, limits: ProjectionLimits): AffectedView;
/** One hop of a traced path. */
export interface HopView extends SymbolView {
    readonly via?: string;
    readonly site_line?: number;
}
/**
 * Project one traced hop.
 * @param hop - the seam's hop record.
 * @param limits - the caps to apply to free text.
 * @returns the model-facing hop.
 */
export declare function toHop(hop: CodegraphTraceHop, limits: ProjectionLimits): HopView;
//# sourceMappingURL=projection.d.ts.map
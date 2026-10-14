/**
 * Seam records to model-facing values. The tool owns this projection because the seam's vocabulary
 * describes a graph while the model's describes code: `filePath`/`startLine` become `path`/`line`,
 * an edge's kind becomes `via`, and the fields a model cannot act on — opaque node ids, index
 * timestamps, provenance — are dropped rather than spent as tokens.
 * @module dsh-plugin-codegraph-tool/projection
 */
/** Cut a string to a cap, marking the cut so a truncated value never reads as complete. */
function clip(value, max) {
    return value.length <= max ? value : `${value.slice(0, max)}…`;
}
/**
 * Project one declaration.
 * @param node - the seam's node record.
 * @param limits - the caps to apply to free text.
 * @returns the model-facing symbol.
 */
export function toSymbol(node, limits) {
    return {
        name: node.name,
        qualified_name: node.qualifiedName,
        kind: node.kind,
        path: node.filePath,
        line: node.startLine,
        end_line: node.endLine,
        language: node.language,
        exported: node.isExported,
        ...node.signature === undefined ? {} : { signature: clip(node.signature, limits.maxSignatureChars) },
        ...node.docstring === undefined ? {} : { docstring: clip(node.docstring, limits.maxDocstringChars) },
    };
}
/**
 * Project one related declaration.
 * @param relation - the seam's relation record.
 * @param limits - the caps to apply to free text.
 * @returns the model-facing relation.
 */
export function toRelation(relation, limits) {
    return {
        ...toSymbol(relation.node, limits),
        via: relation.edge.kind,
        ...relation.edge.line === undefined ? {} : { site_line: relation.edge.line },
        site_count: relation.siteCount,
    };
}
/**
 * Project one impact entry.
 * @param entry - the seam's impact record.
 * @param limits - the caps to apply to free text.
 * @returns the model-facing affected symbol.
 */
export function toAffected(entry, limits) {
    return { ...toSymbol(entry.node, limits), via: entry.via, distance: entry.distance };
}
/**
 * Project one traced hop.
 * @param hop - the seam's hop record.
 * @param limits - the caps to apply to free text.
 * @returns the model-facing hop.
 */
export function toHop(hop, limits) {
    return {
        ...toSymbol(hop.node, limits),
        ...hop.edge === undefined ? {} : { via: hop.edge.kind },
        ...hop.edge?.line === undefined ? {} : { site_line: hop.edge.line },
    };
}
//# sourceMappingURL=projection.js.map
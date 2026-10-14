/**
 * Durable-boundary mapping from SQLite rows to seam records. Every value crossing this module comes
 * from a file an independently versioned indexer wrote, so each field is checked before it becomes a
 * typed record; a row that violates the format fails loud as `CODEGRAPH_MALFORMED_INDEX` rather than
 * reaching a consumer as a plausible-looking wrong value.
 * @module dsh-plugin-codegraph-sqlite/rows
 */
import type { CodegraphEdge, CodegraphFile, CodegraphNode } from 'dsh-plugin-codegraph-service';
/** One `nodes` row as `node:sqlite` returns it, before validation. */
export type NodeRow = Record<string, unknown>;
/**
 * Build a {@link CodegraphNode} from a `nodes` row.
 * @param row - the raw row, selected with every `nodes` column present.
 * @returns the validated node record.
 */
export declare function toNode(row: NodeRow): CodegraphNode;
/**
 * Build a {@link CodegraphEdge} from an `edges` row selected with the `edge_` column prefix that
 * {@link toNode} joins avoid colliding with.
 * @param row - the raw row carrying `edge_source`, `edge_target`, `edge_kind`, `edge_line`,
 * `edge_col`, and `edge_provenance`.
 * @returns the validated edge record.
 */
export declare function toEdge(row: NodeRow): CodegraphEdge;
/**
 * Build a {@link CodegraphFile} from a `files` row.
 * @param row - the raw row, selected with every `files` column present.
 * @returns the validated file record.
 */
export declare function toFile(row: NodeRow): CodegraphFile;
//# sourceMappingURL=rows.d.ts.map
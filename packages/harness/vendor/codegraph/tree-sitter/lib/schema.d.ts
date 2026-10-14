/**
 * Schema-v4 database writer: create the on-disk tables `dsh-plugin-codegraph-sqlite` reads —
 * verbatim in structure, so the store and the external `codegraph` CLI stay able to open what this
 * package writes — and insert one indexing run's resolved graph.
 *
 * Writing replaces whatever was at the path: an indexing run is a full rebuild, not an incremental
 * update. The new graph is built on a same-directory temporary file and `rename`d into place, so a
 * reader opening `databasePath` at any point either sees the complete previous graph or the complete
 * new one — never a window where the file exists with a fresh, empty schema and no rows yet, which a
 * naive "delete then recreate" leaves open between `CREATE TABLE` and the first `COMMIT`.
 * @module dsh-plugin-codegraph-tree-sitter/schema
 */
import type { ExtractedFile, GraphEdge, GraphNode, UnresolvedRef } from './resolve.ts';
/** The schema version this package writes, matching the format `dsh-codegraph-sqlite` reads. */
export declare const SCHEMA_VERSION = 4;
/** One indexing run's complete output, ready to write. */
export interface WriteInput {
    readonly files: readonly ExtractedFile[];
    readonly nodes: readonly GraphNode[];
    readonly edges: readonly GraphEdge[];
    readonly unresolved: readonly UnresolvedRef[];
    readonly indexedAt: number;
}
/**
 * Replace the graph at `databasePath` with one indexing run's output.
 *
 * The full build happens on a temporary file beside `databasePath`; only a successful build is
 * `rename`d over the real path, atomically on the same filesystem. A reader with a connection already
 * open on the old file keeps reading it (POSIX unlink semantics) until it reopens — that half of
 * freshness is the sqlite store's responsibility, not this writer's.
 * @param databasePath - absolute path of the `.codegraph/codegraph.db` file to (re)create.
 * @param input - the run's resolved graph and per-file metadata.
 */
export declare function writeGraph(databasePath: string, input: WriteInput, signal?: AbortSignal): Promise<void>;
//# sourceMappingURL=schema.d.ts.map
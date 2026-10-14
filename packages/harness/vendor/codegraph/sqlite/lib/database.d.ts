/**
 * Connection ownership for the on-disk knowledge graph: where a project root's database lives, the
 * format-version gate every connection passes before serving a query, and the bounded pool that
 * keeps recently queried projects open.
 *
 * Databases open READ-ONLY. The external indexer may be writing through its own daemon while the
 * harness reads, so this store never takes a write lock, never recovers a journal, and never repairs
 * an index it does not own.
 * @module dsh-plugin-codegraph-sqlite/database
 */
import { DatabaseSync } from 'node:sqlite';
/**
 * Where the external indexer keeps a project's graph, relative to the project root. Fixed by that
 * tool's on-disk layout rather than configurable: pointing this store at another path would not make
 * a different file readable, it would only fail later and less clearly.
 */
export declare const DATABASE_RELATIVE_PATH = ".codegraph/codegraph.db";
/**
 * The single on-disk format version this store reads. The format is an external specification, so
 * support is a fixed fact rather than a deployment choice; a database at any other version fails
 * loud instead of being read through assumptions that no longer hold.
 */
export declare const SUPPORTED_FORMAT_VERSION = 4;
/**
 * The absolute path of a project root's graph database.
 * @param projectRoot - absolute path of the indexed project root.
 * @returns the database path, whether or not it exists.
 */
export declare function databasePath(projectRoot: string): string;
/**
 * Open one project's graph read-only and verify its format version.
 * @param projectRoot - absolute path of the indexed project root.
 * @returns the open, version-checked connection.
 */
export declare function openGraph(projectRoot: string): DatabaseSync;
/**
 * A bounded set of open graph connections keyed by project root, evicting the least recently used
 * one when full. Every connection the pool hands out stays valid until {@link close}: eviction and
 * disposal both close connections, so a caller holds a connection only for the duration of one
 * synchronous query.
 *
 * A connection is opened against one specific on-disk file. An indexing run replaces that file
 * wholesale (rename over the old path), and POSIX unlink semantics mean an already-open read-only
 * connection keeps serving the REPLACED file's bytes indefinitely — reopening is the only way to see
 * the new graph. `acquire` detects that swap by comparing the device/inode recorded at open time
 * against the path's current identity, so a cache hit never silently serves a graph an indexing run
 * has already superseded.
 */
export declare class GraphPool {
    private readonly capacity;
    private readonly open;
    private disposed;
    /**
     * @param capacity - largest number of simultaneously open databases; at least 1.
     */
    constructor(capacity: number);
    /**
     * The connection for a project root, opening and caching it on first use. Reopens automatically
     * when the file on disk is no longer the one the cached connection was opened against.
     * @param projectRoot - absolute path of the indexed project root.
     * @returns the open, version-checked connection, current as of this call.
     */
    acquire(projectRoot: string): DatabaseSync;
    /** Close every open connection; further {@link acquire} calls fail as `CODEGRAPH_DISPOSED`. */
    close(): void;
    /** Close least-recently-used connections until the pool fits its capacity. */
    private evictOverflow;
}
//# sourceMappingURL=database.d.ts.map
/**
 * File-watch-driven reindexing: debounce a workspace's file-change events into a bounded number of
 * `sync` calls, using a per-platform strategy chosen to keep the open-descriptor / kernel-watch cost
 * BOUNDED rather than growing with the number of files:
 *
 *  - macOS / Windows: a SINGLE recursive `fs.watch(root, {recursive:true})`. This is the fix for the
 *    macOS file-table exhaustion a reference implementation hit watching one file descriptor per
 *    watched file (tens of thousands of REG fds), which exhausted `kern.maxfiles` and crashed
 *    unrelated processes system-wide (see NOTES.local.md). One recursive stream costs O(1)
 *    descriptors no matter how large the tree.
 *  - Linux: recursive `fs.watch` is unsupported, so one inotify watch is installed per (non-excluded)
 *    directory — O(directories), NOT O(files). New directories are picked up dynamically as events
 *    reveal them, and {@link WatchConfig.maxWatchedDirectories} bounds inotify usage on pathological
 *    monorepos.
 *
 * `sync` is always a full rebuild in this version: the `paths` a debounce window collected are passed
 * through but never consulted by the caller supplied here (`runIndex` reruns `walkAndExtract` over the
 * whole tree regardless). That keeps this file's only new correctness surface confined to "when do we
 * call sync", not "what does sync do with a subset of files" — the latter is deliberately deferred
 * until a real incremental reindex is built (see NOTES.local.md). Because sync is always full, a
 * directory delete or a `mkdir` immediately followed by writes inside it never needs special-casing:
 * the parent directory's own create event is enough to schedule a rebuild that discovers (or removes)
 * everything under the path from scratch, watched or not.
 * @module dsh-plugin-codegraph-tree-sitter/watcher
 */
/** One raw watch event, in the shape `node:fs`'s `fs.watch` listener callback receives. */
export type WatchEventListener = (eventType: 'rename' | 'change', filename: string | null) => void;
/** A watch error, in the shape `fs.watch`'s `'error'` event delivers. */
export type WatchErrorListener = (error: unknown) => void;
/** A live OS-level watch, closeable independent of anything else this module tracks. */
export interface WatchHandle {
    close(): void;
}
/**
 * Indirection over `fs.watch` so tests can inject a fake that emits events/errors deterministically —
 * `fs.watch` is a non-configurable module property that can't be spied, and provoking real EMFILE/
 * ENOSPC exhaustion in a test run isn't reliable. Production always uses {@link nodeWatch}.
 */
export type WatchPrimitive = (path: string, options: {
    readonly recursive: boolean;
}, onEvent: WatchEventListener, onError: WatchErrorListener) => WatchHandle;
/** The real `fs.watch`-backed primitive. */
export declare const nodeWatch: WatchPrimitive;
/** Why live watching was permanently disabled for this watcher instance. */
export type DegradeReason = {
    readonly code: 'RESOURCE_EXHAUSTED';
    readonly cause: NodeJS.ErrnoException;
} | {
    readonly code: 'WATCH_LIMIT_EXCEEDED';
} | {
    readonly code: 'SYNC_FAILURE_LIMIT';
    readonly cause: unknown;
};
/** Configuration a watcher needs to run: scope, timing, and the sync it drives. */
export interface WatchConfig {
    /** Absolute path of the workspace root to watch. */
    readonly root: string;
    /** Directory/file segment names never watched, mirroring the indexer's own exclusion. */
    readonly exclude: readonly string[];
    /** Also exclude whatever the project root's `.gitignore` names, matching the indexer's own scope. */
    readonly respectGitignore: boolean;
    /** Milliseconds of quiet after the last change before `sync` runs. */
    readonly debounceMs: number;
    /** Hard cap on directories watched individually (Linux only); exceeding it degrades the watcher. */
    readonly maxWatchedDirectories: number;
    /**
     * Run one reindex. `paths` are the project-relative paths a debounce window collected, offered for
     * a future incremental sync to consult; this version's caller always ignores them and rebuilds the
     * whole graph.
     */
    readonly sync: (paths?: readonly string[]) => Promise<{
        filesChanged: number;
        durationMs: number;
    }>;
    /** Fired once, the first time live watching degrades permanently. */
    readonly onDegraded?: (reason: DegradeReason) => void;
}
/** A running (or stopped) file watcher for one workspace root. */
export interface Watcher {
    /** Begin watching. Idempotent while already running; clears a prior degradation and retries. */
    start(): void;
    /** Stop watching and release every OS-level watch. Does not itself count as degradation. */
    stop(): void;
    /** Whether live watching has permanently degraded (until the next {@link start}). */
    isDegraded(): boolean;
    /** Project-relative paths seen since the last debounce window fired a sync. */
    getPendingFiles(): readonly string[];
}
/**
 * Build a watcher over one workspace root. Nothing runs until {@link Watcher.start} is called.
 * @param config - scope, timing, and the sync callback to drive.
 * @param primitive - the watch primitive to use; defaults to the real `fs.watch`.
 */
export declare function createWatcher(config: WatchConfig, primitive?: WatchPrimitive): Watcher;
//# sourceMappingURL=watcher.d.ts.map
/**
 * Workspace directory walk: find every file this package can extract from, parse it, and hand back
 * one {@link ExtractedFile} per file that was actually indexed.
 *
 * The walk is deliberately simple: `exclude` entries name directory segments to never descend into
 * (not wildcard globs — the default set needs none), and every bound (`maxFileBytes`, `maxFiles`) is
 * a config field the deployment can retune rather than a constant, per the same-name entries this
 * package's `Config` exposes.
 * @module dsh-plugin-codegraph-tree-sitter/walk
 */
import type { GitignoreRule } from './gitignore.ts';
import type { ExtractedFile } from './resolve.ts';
/**
 * Whether one directory entry is excluded from both the index and (for `watcher.ts`) the watch tree —
 * the single definition both consult, so "what the index covers" and "what gets watched" can never
 * drift apart.
 * @param name - the entry's own name (not a path), matched against `excluded` verbatim.
 * @param relativePath - the entry's project-relative path, matched against the `.gitignore` rules.
 * @param isDirectory - whether the entry is a directory, for `.gitignore`'s directory-only rules.
 * @param excluded - directory/file segment names never descended into.
 * @param gitignoreRules - the project's parsed `.gitignore`, or empty when not respected.
 */
export declare function isExcluded(name: string, relativePath: string, isDirectory: boolean, excluded: ReadonlySet<string>, gitignoreRules: readonly GitignoreRule[]): boolean;
/** The walk's tunable bounds, mirroring this package's `Config`. */
export interface WalkConfig {
    /** Directory segment names never descended into. */
    readonly exclude: readonly string[];
    /** Files larger than this are skipped and counted, never parsed. */
    readonly maxFileBytes: number;
    /** The walk stops discovering new files once this many have been found. */
    readonly maxFiles: number;
    /** Files parsed concurrently. */
    readonly concurrency: number;
    /** Restrict extraction to these seam language labels when set; every loaded grammar otherwise. */
    readonly languages?: readonly string[];
    /**
     * Also exclude whatever the project root's `.gitignore` names, unioned with `exclude`. A project
     * that compiles to a gitignored directory (`lib`, `dist`, ...) would otherwise hand the same symbol
     * to the resolver twice — once from source, once from the build output — and "the one unique
     * workspace-wide name wins" call resolution would pick between them arbitrarily.
     */
    readonly respectGitignore: boolean;
}
/** What the walk produced. */
export interface WalkResult {
    readonly files: ExtractedFile[];
    readonly filesSkipped: number;
}
/**
 * Walk `projectRoot` and parse every candidate file it finds.
 * @param projectRoot - absolute path of the workspace to index.
 * @param config - the walk's bounds.
 * @param signal - aborts the walk.
 * @returns the parsed files and how many candidates were skipped (over size, or past `maxFiles`).
 */
export declare function walkAndExtract(projectRoot: string, config: WalkConfig, signal?: AbortSignal): Promise<WalkResult>;
//# sourceMappingURL=walk.d.ts.map
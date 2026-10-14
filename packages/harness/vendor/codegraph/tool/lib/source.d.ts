/**
 * Source retrieval for the operations that return code. Reads go through `ctx.fs`, never
 * `node:fs`: the filesystem seam is what resolves a path against the session workspace, enforces
 * read policy, and reaches a remote sandbox, so a tool that opened files directly would bypass all
 * three for the one operation most likely to touch a file it should not.
 *
 * A read that fails is not an error here. The graph names a file the index recorded, which may since
 * have been renamed or deleted; the honest answer is the symbols with `code: null`, not a failed
 * query.
 * @module dsh-plugin-codegraph-tool/source
 */
import type { Context } from '@deepseek-ai/cordis';
/** The line window a source slice covers, and whether it was cut short. */
export interface SourceSlice {
    /** The retrieved text, or null when the file could not be read. */
    readonly code: string | null;
    /** One-based first line of {@link code}, when text was retrieved. */
    readonly startLine?: number;
    /** Whether the requested range was cut by the line or character cap. */
    readonly truncated: boolean;
}
/** Bounds on one retrieved slice. */
export interface SourceLimits {
    /** Largest number of lines one slice may carry. */
    readonly maxLines: number;
    /** Largest number of characters one slice may carry. */
    readonly maxChars: number;
}
/**
 * Read a one-based inclusive line range from a project-relative file.
 * @param ctx - the plugin context, whose `fs` performs the read.
 * @param projectRoot - absolute path the file path resolves against.
 * @param filePath - the file, relative to the project root.
 * @param startLine - one-based first line to return.
 * @param endLine - one-based last line to return.
 * @param limits - the caps applied to the returned text.
 * @param signal - aborts the read.
 * @returns the slice, with `code: null` when the file is unreadable.
 */
export declare function readSlice(ctx: Context, projectRoot: string, filePath: string, startLine: number, endLine: number, limits: SourceLimits, signal?: AbortSignal): Promise<SourceSlice>;
//# sourceMappingURL=source.d.ts.map
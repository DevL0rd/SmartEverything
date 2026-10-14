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
import { createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { confinedPath, readConfinedText } from 'dsh-plugin-codegraph-service/paths';
import { posix } from 'node:path';
import { createParser } from "./grammar.js";
import { extractFile } from "./extract.js";
import { loadGitignore, matchesGitignore } from "./gitignore.js";
import { languageFor } from "./languages.js";
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
export function isExcluded(name, relativePath, isDirectory, excluded, gitignoreRules) {
    return excluded.has(name) || matchesGitignore(gitignoreRules, relativePath, isDirectory);
}
/**
 * Recursively list every candidate file under `projectRoot`, honoring `exclude` and `maxFiles`.
 * @param projectRoot - absolute path of the root to scan.
 * @param config - the walk's bounds.
 * @param signal - aborts the scan.
 * @returns the candidates found, and how many further candidates `maxFiles` cut off.
 */
async function discover(projectRoot, config, signal) {
    const excluded = new Set(config.exclude);
    const gitignoreRules = config.respectGitignore ? await loadGitignore(projectRoot) : [];
    const candidates = [];
    let overflow = 0;
    let directories = 0;
    async function scan(relativeDir) {
        signal?.throwIfAborted();
        directories += 1;
        if (directories > config.maxDirectories) throw new Error('Codegraph directory scan limit exceeded.');
        const entries = await readdir(confinedPath(projectRoot, relativeDir), { withFileTypes: true });
        for (const entry of entries) {
            signal?.throwIfAborted();
            const relativePath = relativeDir === '' ? entry.name : `${relativeDir}/${entry.name}`;
            if (isExcluded(entry.name, relativePath, entry.isDirectory(), excluded, gitignoreRules))
                continue;
            if (entry.isDirectory()) {
                await scan(relativePath);
                continue;
            }
            if (!entry.isFile())
                continue;
            const extension = posix.extname(entry.name);
            const spec = languageFor(extension);
            if (spec === undefined)
                continue;
            if (config.languages !== undefined && !config.languages.includes(spec.language))
                continue;
            if (candidates.length >= config.maxFiles) {
                overflow++;
                continue;
            }
            candidates.push({ path: relativePath, projectRoot, language: spec.language });
        }
    }
    await scan('');
    return { candidates, overflow };
}
/** Parse one candidate, or return `undefined` when it is over {@link WalkConfig.maxFileBytes}. */
async function parseCandidate(candidate, config, signal) {
    const source = await readConfinedText(candidate.projectRoot, candidate.path, config.maxFileBytes, signal);
    if (source === undefined) return undefined;
    const { text, stats } = source;
    const spec = languageFor(posix.extname(candidate.path));
    /* v8 ignore next 2 -- discover() only ever produces a candidate whose extension resolved to a spec. */
    if (spec === undefined)
        return undefined;
    const parser = await createParser(spec);
    try {
        signal?.throwIfAborted();
        const tree = parser.parse(text);
        /* v8 ignore next 2 -- createParser() always assigns a language before returning; parse() returns
         * null only when the parser has none. */
        if (tree === null)
            return undefined;
        let extraction;
        try { extraction = extractFile(tree, spec); } finally { tree.delete(); }
        return {
            path: candidate.path,
            language: spec.language,
            size: stats.size,
            modifiedAt: stats.mtimeMs,
            contentHash: createHash('sha256').update(text).digest('hex'),
            lineCount: text.split('\n').length,
            extraction,
        };
    }
    finally {
        parser.delete();
    }
}
/** Run `tasks` with at most `concurrency` in flight at once, preserving input order in the result. */
async function mapWithConcurrency(items, concurrency, task) {
    const results = new Array(items.length);
    let next = 0;
    async function worker() {
        for (;;) {
            const index = next++;
            if (index >= items.length)
                return;
            // `index < items.length` above guarantees a defined element; `noUncheckedIndexedAccess` just
            // cannot express that.
            const item = items[index];
            /* v8 ignore next */
            if (item === undefined)
                continue;
            results[index] = await task(item);
        }
    }
    const resultsSettled = await Promise.allSettled(Array.from({ length: Math.min(concurrency, items.length) }, worker));
    const failure = resultsSettled.find(result => result.status === 'rejected');
    if (failure !== undefined) throw failure.reason;
    return results;
}
/**
 * Walk `projectRoot` and parse every candidate file it finds.
 * @param projectRoot - absolute path of the workspace to index.
 * @param config - the walk's bounds.
 * @param signal - aborts the walk.
 * @returns the parsed files and how many candidates were skipped (over size, or past `maxFiles`).
 */
export async function walkAndExtract(projectRoot, config, signal) {
    const { candidates, overflow } = await discover(projectRoot, config, signal);
    const parsed = await mapWithConcurrency(candidates, config.concurrency, candidate => parseCandidate(candidate, config, signal));
    const files = [];
    let filesSkipped = overflow;
    for (const file of parsed) {
        if (file === undefined)
            filesSkipped++;
        else
            files.push(file);
    }
    return { files, filesSkipped };
}
//# sourceMappingURL=walk.js.map
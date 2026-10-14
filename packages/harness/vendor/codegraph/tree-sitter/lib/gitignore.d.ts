/**
 * A deliberately small subset of `.gitignore` pattern syntax, just enough to keep the indexer's
 * exclusion set in step with what a project's own build tooling already hides from version control —
 * without a new dependency on a full gitignore-matching library.
 *
 * Only the project root's `.gitignore` is read; per-directory `.gitignore` files nested below it are
 * not consulted, matching the walk's own root-relative worldview.
 *
 * Supported:
 *  - Blank lines and lines starting with `#` are comments.
 *  - A leading `!` negates: a later matching rule re-includes a path an earlier rule excluded.
 *  - A pattern containing `/` (leading or internal) is anchored to the project root; one with no `/`
 *    at all matches at any depth, by basename.
 *  - A trailing `/` restricts the rule to directories.
 *  - `*` matches any run of characters other than `/`, within one path segment.
 *
 * Not supported. Each is treated as a literal character (or, for `**`, as two literal `*` globs),
 * which only ever makes a pattern *more* specific than a real gitignore would — it degrades toward
 * "excludes nothing extra" rather than toward "excludes too much":
 *  - `**` (explicit multi-segment wildcards — plain unanchored patterns already cross depths)
 *  - character classes (`[abc]`), `?`, and backslash escapes
 *  - git's rule that a negation cannot resurrect a path inside an already-excluded directory: here,
 *    a negation re-includes whatever it matches regardless of ancestor exclusions.
 * @module dsh-plugin-codegraph-tree-sitter/gitignore
 */
/** One parsed `.gitignore` rule, pre-compiled to a matcher. */
export interface GitignoreRule {
    /** Matches a full project-relative, `/`-separated path. */
    readonly pattern: RegExp;
    /** `!`-prefixed: a match re-includes rather than excludes. */
    readonly negated: boolean;
    /** Trailing-`/`: only ever matches a directory. */
    readonly directoryOnly: boolean;
}
/**
 * Parse `.gitignore` file content into an ordered rule list.
 * @param content - the raw file text.
 * @returns rules in file order. Matching must apply them in order and keep the last match, per
 *   git's own precedence — a later line overrides an earlier one it conflicts with.
 */
export declare function parseGitignore(content: string): GitignoreRule[];
/**
 * Whether `relativePath` should be excluded per `rules`. Later rules win over earlier ones, matching
 * git's own precedence: the loop keeps applying matches rather than stopping at the first one.
 * @param rules - parsed rules, in file order.
 * @param relativePath - the path to test, relative to the project root, `/`-separated.
 * @param isDirectory - whether the path names a directory; directory-only rules skip files.
 * @returns whether the path is excluded.
 */
export declare function matchesGitignore(rules: readonly GitignoreRule[], relativePath: string, isDirectory: boolean): boolean;
/**
 * Load and parse `<projectRoot>/.gitignore`.
 * @param projectRoot - absolute path of the project root.
 * @returns the parsed rules, or an empty array when there is no root `.gitignore` — a missing file
 *   means "nothing extra to exclude," not a failure, so this never throws.
 */
export declare function loadGitignore(projectRoot: string): Promise<GitignoreRule[]>;
//# sourceMappingURL=gitignore.d.ts.map
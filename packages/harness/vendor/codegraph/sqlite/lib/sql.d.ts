/**
 * SQL fragments shared by the store's queries: the column projections the row mappers expect, the
 * ranking expressions that decide which declaration a bare symbol name means, and the escaping that
 * makes an arbitrary model-supplied string a safe FTS5 query.
 *
 * Ranking is expressed in SQL rather than in TypeScript so ordering and truncation happen in the
 * same statement: a `LIMIT` must keep the most relevant matches, which it can only do if the
 * database already knows the order.
 * @module dsh-plugin-codegraph-sqlite/sql
 */
/** Every `nodes` column {@link toNode} reads, aliased `n`. */
export declare const NODE_COLUMNS: string;
/**
 * Order candidates for a symbol lookup: match exactness first, then declaration relevance, then
 * exported over internal, then file and line so equally ranked results never reorder between runs.
 * Binds the symbol three times, ahead of any other parameter in the statement.
 */
export declare const SYMBOL_ORDER = "CASE\n  WHEN n.qualified_name = ? THEN 0\n  WHEN n.name = ? THEN 1\n  WHEN lower(n.name) = lower(?) THEN 2\n  ELSE 3\nEND, CASE n.kind\n  WHEN 'function' THEN 0\n  WHEN 'method' THEN 0\n  WHEN 'class' THEN 1\n  WHEN 'component' THEN 1\n  WHEN 'struct' THEN 1\n  WHEN 'interface' THEN 2\n  WHEN 'trait' THEN 2\n  WHEN 'protocol' THEN 2\n  WHEN 'type_alias' THEN 3\n  WHEN 'enum' THEN 3\n  WHEN 'route' THEN 3\n  WHEN 'constant' THEN 4\n  WHEN 'variable' THEN 4\n  WHEN 'property' THEN 5\n  WHEN 'field' THEN 5\n  WHEN 'enum_member' THEN 5\n  WHEN 'parameter' THEN 6\n  WHEN 'namespace' THEN 6\n  WHEN 'module' THEN 6\n  WHEN 'import' THEN 7\n  WHEN 'export' THEN 7\n  WHEN 'file' THEN 8\n  ELSE 6\nEND, n.is_exported DESC, n.file_path, n.start_line";
/** Order candidates for a free-text search. Binds the query four times. */
export declare const SEARCH_ORDER = "CASE\n  WHEN n.name = ? THEN 0\n  WHEN lower(n.name) = lower(?) THEN 1\n  WHEN lower(n.name) LIKE lower(?) || '%' THEN 2\n  WHEN lower(n.qualified_name) LIKE '%' || lower(?) || '%' THEN 3\n  ELSE 4\nEND, CASE n.kind\n  WHEN 'function' THEN 0\n  WHEN 'method' THEN 0\n  WHEN 'class' THEN 1\n  WHEN 'component' THEN 1\n  WHEN 'struct' THEN 1\n  WHEN 'interface' THEN 2\n  WHEN 'trait' THEN 2\n  WHEN 'protocol' THEN 2\n  WHEN 'type_alias' THEN 3\n  WHEN 'enum' THEN 3\n  WHEN 'route' THEN 3\n  WHEN 'constant' THEN 4\n  WHEN 'variable' THEN 4\n  WHEN 'property' THEN 5\n  WHEN 'field' THEN 5\n  WHEN 'enum_member' THEN 5\n  WHEN 'parameter' THEN 6\n  WHEN 'namespace' THEN 6\n  WHEN 'module' THEN 6\n  WHEN 'import' THEN 7\n  WHEN 'export' THEN 7\n  WHEN 'file' THEN 8\n  ELSE 6\nEND, n.is_exported DESC, n.file_path, n.start_line";
/**
 * Turn a model-supplied string into an FTS5 prefix query that cannot be misread as FTS syntax.
 * Doubling the quote characters and wrapping the whole value in quotes makes it one literal phrase,
 * so `AND`, `*`, `:` and parentheses in a symbol name search for themselves instead of changing the
 * query's meaning.
 * @param query - the raw search text.
 * @returns an FTS5 MATCH expression matching the text as a prefix phrase.
 */
export declare function ftsPhrase(query: string): string;
/**
 * Wrap a raw string as a SQL `LIKE` pattern matching it anywhere, escaping the wildcard characters
 * so a symbol containing `%` or `_` matches literally.
 * @param query - the raw search text.
 * @returns the escaped pattern, for use with `LIKE ? ESCAPE '\\'`.
 */
export declare function likeAnywhere(query: string): string;
//# sourceMappingURL=sql.d.ts.map
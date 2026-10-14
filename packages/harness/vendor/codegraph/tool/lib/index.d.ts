/**
 * Model-facing `codegraph` tool family over `ctx.codegraph` and `ctx.fs`. The `codegraph` tool is
 * read-only, with ten operations: the eight the seam answers directly, plus `explore` and `context`,
 * which compose graph queries with source reads because a graph store returns positions and cannot
 * reach a workspace's bytes. A second tool, `codegraph_index`, builds or refreshes the graph on
 * explicit request; it is separate so it can carry its own, much larger timeout budget than a query
 * — `defineTool`'s `timeoutMs` is fixed per registration, not per call, so one operation cannot borrow
 * a bigger budget from within a shared tool.
 *
 * The tools own every default the seam refuses to guess — result limits, traversal depth, source
 * caps — so the seam's requests stay fully specified and a deployment can retune the model's answer
 * size without touching a store. They runtime-inject only `tools`, `codegraph`, `fs`, and
 * `systemPrompt`, and import no store.
 *
 * Namespace plugin (named exports, no default export).
 * @module dsh-plugin-codegraph-tool
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { CodegraphToolArgs } from './schema.ts';
export { CODEGRAPH_INDEX_PARAMETERS, CODEGRAPH_OPERATIONS, CODEGRAPH_OUTPUT_SCHEMA, CODEGRAPH_PARAMETERS, type CodegraphIndexToolArgs, type CodegraphToolArgs, type CodegraphToolOperation, type CodegraphToolValue, type CodegraphValueFor, } from './schema.ts';
export { declarationsOnly, groupByFile, mergeByHits, mergeRelations, taskTerms } from './compose.ts';
export { toAffected, toHop, toRelation, toSymbol } from './projection.ts';
export { renderCodegraph } from './render.ts';
export { readSlice } from './source.ts';
/** Cordis plugin name for loader diagnostics. */
export declare const name = "tool-codegraph";
/** Services required by this plugin. */
export declare const inject: string[];
/** Default tool-call timeout budget (ms) for the query-side `codegraph` tool. */
export declare const DEFAULT_CODEGRAPH_TOOL_TIMEOUT_MS = 30000;
/** Default timeout budget (ms) for the `codegraph_index` tool. Indexing a monorepo is a different order of work than a query. */
export declare const DEFAULT_CODEGRAPH_INDEX_TIMEOUT_MS = 300000;
/** The stable system-prompt guidance positioning the code graph against search and read. */
export declare const CODEGRAPH_PROMPT_TEXT = "Use codegraph for structural questions about code: where a symbol is declared, what calls it, what it calls, what a change to it reaches, and how one symbol reaches another. It answers from a pre-built index, so it is both faster and more precise than grepping for a name, which also matches comments, strings, and unrelated identifiers. Use search/read instead for literal text, and when codegraph reports no index for a workspace. When status reports no index, call codegraph_index once to build one \u2014 it runs on its own, longer timeout budget than a query \u2014 then retry. Results reflect the last time the workspace was indexed; a declaration added since then is absent.";
/** Plugin configuration: the defaults and caps the seam requires the consumer to own. */
export interface Config {
    /** Results returned when the model names no `limit` (default 20). */
    defaultLimit?: number;
    /** Largest `limit` honored, whatever the model asks for (default 200). */
    maxLimit?: number;
    /** Hops traversed by `impact` and `trace` when the model names no `depth` (default 2). */
    defaultDepth?: number;
    /** Largest `depth` honored (default 6). */
    maxDepth?: number;
    /** Distinct paths `trace` returns (default 5). */
    maxPaths?: number;
    /** Files whose source `explore` and `context` return (default 5). */
    maxSourceFiles?: number;
    /** Lines of source carried per file (default 200). */
    maxSourceLines?: number;
    /** Characters of source carried per file (default 8000). */
    maxSourceChars?: number;
    /** Characters of documentation carried per symbol (default 400). */
    maxDocstringChars?: number;
    /** Characters of signature carried per symbol (default 200). */
    maxSignatureChars?: number;
    /** Search terms extracted from a `context` task description (default 6). */
    maxContextTerms?: number;
    /** Tool-call timeout budget in ms for the query-side `codegraph` tool (default 30000). */
    timeoutMs?: number;
    /** Tool-call timeout budget in ms for the `codegraph_index` tool (default 300000). */
    indexTimeoutMs?: number;
}
export declare const Config: z<Config>;
/**
 * Register the `codegraph` tool and its system-prompt guidance.
 * @param ctx - the plugin context (must inject `tools`, `codegraph`, `fs`, `systemPrompt`).
 * @param config - the resolved plugin configuration.
 */
export declare function apply(ctx: Context, config: Config): void;
/**
 * The one-line label a pending call shows.
 * @param args - the validated tool arguments.
 * @returns the card title naming the operation and whichever subject the operation takes.
 */
export declare function callTitle(args: CodegraphToolArgs): string;
//# sourceMappingURL=index.d.ts.map
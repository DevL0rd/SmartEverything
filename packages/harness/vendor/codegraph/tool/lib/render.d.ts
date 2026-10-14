/**
 * Model-facing text for each operation's canonical value.
 *
 * Every line leads with `path:line` so a location can be acted on directly, and a truncated answer
 * always says so — a capped list that reads as complete is worse than a short one, because the model
 * concludes it has seen everything.
 * @module dsh-plugin-codegraph-tool/render
 */
import type { CodegraphToolValue } from './schema.ts';
/**
 * Render one result as the text the model reads.
 * @param value - the canonical value the operation returned.
 * @returns the rendered text.
 */
export declare function renderCodegraph(value: CodegraphToolValue): string;
//# sourceMappingURL=render.d.ts.map
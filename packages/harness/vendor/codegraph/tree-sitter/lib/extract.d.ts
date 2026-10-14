/**
 * One-file extraction: walk a parsed tree exactly once, collecting the definitions, call sites, and
 * import bindings the two-pass resolver in `resolve.ts` needs.
 *
 * The caller of a call node is the nearest enclosing definition, or the file itself when the call sits
 * at module top level — the on-disk format records it that way, and a third of the call edges in a
 * real workspace are of exactly this shape.
 * @module dsh-plugin-codegraph-tree-sitter/extract
 */
import type { Tree } from 'web-tree-sitter';
import type { LanguageSpec } from './languages.ts';
/** One declaration this file introduces, before cross-file resolution. */
export interface RawDefinition {
    /** Stable position-derived key, unique within the file. */
    readonly key: string;
    /** The immediately enclosing definition's {@link key}, or `null` for a module-top-level definition. */
    readonly parentKey: string | null;
    readonly kind: string;
    readonly name: string;
    /** Enclosing definition names, outermost first; used to build `qualifiedName`. */
    readonly container: readonly string[];
    readonly startLine: number;
    readonly endLine: number;
    readonly startColumn: number;
    readonly endColumn: number;
    readonly isExported: boolean;
    readonly isAsync: boolean;
    readonly isStatic: boolean;
    /**
     * Decorator names applied to this declaration — recorded as descriptive metadata only, never
     * resolved to an edge (a decorator can be an arbitrary call, e.g. `@app.route('/x')`, with no
     * reliable single "target" the way an import or a base class has one). Empty for every language but
     * Python today.
     */
    readonly decorators: readonly string[];
}
/** One call site this file contains, before callee resolution. */
export interface RawCall {
    /** The calling definition's {@link RawDefinition.key}, or `null` for a module-top-level call. */
    readonly callerKey: string | null;
    /** The callee's simple name, e.g. `parse` from `parse(x)` or `obj.parse(x)`. */
    readonly calleeName: string;
    readonly line: number;
    readonly column: number;
    /**
     * Whether the callee expression is a member access (`obj.parse()`) rather than a bare identifier
     * (`parse()`). With no type information, a member call's receiver could be anything, so a name
     * match against it is far less trustworthy than a bare identifier's — `resolve.ts` uses this to
     * separate that noise from a genuine gap in the graph when a call goes unresolved.
     */
    readonly isMemberCall: boolean;
}
/** One import binding this file introduces. */
export interface RawImport {
    /** The name this file's scope binds, after any `as` rename. */
    readonly localName: string;
    /** The name as declared in the source module, `'default'` for a default import, or `'*'` for a
     * namespace or whole-package import — the latter two never drive resolution but are recorded for
     * completeness. */
    readonly importedName: string;
    /** The raw module specifier text, e.g. `./bar` or `fmt`. */
    readonly specifier: string;
}
/** One `extends`/`implements` reference a captured class or interface declares, before resolution. */
export interface RawHeritageRef {
    /** The declaring class or interface's own {@link RawDefinition.key}. */
    readonly sourceKey: string;
    /** The base/interface's simple name — a member expression or call (a mixin, `class X extends f(Y)`)
     * is not a name this package attempts to resolve, matching its existing "don't guess" precedent. */
    readonly targetName: string;
    readonly relation: 'extends' | 'implements';
}
/** Everything one file's walk produced. */
export interface FileExtraction {
    readonly definitions: RawDefinition[];
    readonly calls: RawCall[];
    readonly imports: RawImport[];
    readonly heritage: RawHeritageRef[];
}
/**
 * Extract every definition, call, and import from one parsed file.
 * @param tree - the file's parsed syntax tree.
 * @param spec - the language's extraction table entry.
 * @returns the raw, not-yet-resolved extraction.
 */
export declare function extractFile(tree: Tree, spec: LanguageSpec): FileExtraction;
//# sourceMappingURL=extract.d.ts.map
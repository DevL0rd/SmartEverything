/**
 * Lazy, process-cached grammar loading. `Parser.init()` boots one Emscripten runtime shared by every
 * grammar; each `Language` loads from its `tree-sitter-wasms` binary only the first time a matching
 * file is seen.
 *
 * Loading is lazy and per-language for a concrete reason: the reference implementation this package
 * targets loads its full grammar set eagerly and must run its bundled Node with `--liftoff-only` to
 * survive V8 running out of WASM code space. This harness cannot pass that flag to the Node process
 * that runs it, so it must never load a grammar the workspace does not use.
 * @module dsh-plugin-codegraph-tree-sitter/grammar
 */
import { Language, Parser } from 'web-tree-sitter';
import type { LanguageSpec } from './languages.ts';
/**
 * The parsed grammar for one language, loading and caching it on first use.
 * @param spec - the language's extraction table entry, naming its wasm file.
 * @returns the loaded grammar, shared by every caller for the process lifetime.
 */
export declare function loadGrammar(spec: LanguageSpec): Promise<Language>;
/**
 * A parser configured for one language, built fresh per call because `Parser` carries mutable parse
 * state a concurrent caller must not share.
 * @param spec - the language's extraction table entry.
 * @returns a parser ready to parse source in this language.
 */
export declare function createParser(spec: LanguageSpec): Promise<Parser>;
//# sourceMappingURL=grammar.d.ts.map
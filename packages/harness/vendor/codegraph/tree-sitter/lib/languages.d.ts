/**
 * Per-language extraction tables: which tree-sitter node types are definitions, which are call
 * sites, and which anchor an import, for every grammar this package loads today.
 *
 * The table is deliberately small. It covers the definition/call/import core the seam's operations
 * depend on — not every declaration shape a language can produce — because the alternative is porting
 * the reference indexer's language-specific resolution, which the proposal this package implements
 * defers until the core proves itself against real workspaces.
 * @module dsh-plugin-codegraph-tree-sitter/languages
 */
/** One tree-sitter node type that introduces a declaration, mapped to the seam's `NODE_KINDS`. */
export interface DefinitionRule {
    /** The tree-sitter node type this rule matches, e.g. `function_declaration`. */
    readonly nodeType: string;
    /** The seam node kind to record, e.g. `function`. See `NODE_KINDS` in `dsh-plugin-codegraph-service`. */
    readonly kind: string;
    /** The field holding the declared name; `childForFieldName(nameField)` must be an identifier. */
    readonly nameField: string;
    /**
     * Present only when this rule is conditional on the shape of a value it binds — a
     * `variable_declarator` is a function definition when its `value` is a function expression, and is
     * otherwise not extracted at all. Field and matching types travel together so a rule can never
     * declare one without the other.
     */
    readonly value?: {
        /** Field naming the value assigned to the binding. */
        readonly field: string;
        /** Node types the field must resolve to for this rule to match. */
        readonly types: readonly string[];
    };
    /**
     * Present only when this rule must reject a name shape it cannot represent as a single declared
     * name — a destructuring `variable_declarator` (`const {a, b} = x`) or a Python tuple/attribute
     * assignment (`a, b = 1, 2`, `self.x = 1`) binds through {@link nameField} too, but to a pattern
     * node this package does not attempt to name. Absent, any node type in {@link nameField} matches.
     */
    readonly nameNodeTypes?: readonly string[];
    /**
     * Present only when this rule must not match the same node type wherever it appears — a bare
     * `property_identifier` names an enum member only directly inside an `enum_body`; the same node
     * type also names a method, a class field, and a member-expression property everywhere else. Absent,
     * any parent matches.
     */
    readonly parentType?: string;
    /**
     * True only for a rule this package extracts solely directly inside a module's top level or a class
     * body — never inside a function or method body. Unlike a function or class declaration (captured at
     * any depth, however deeply nested), a function-local variable is not a workspace "symbol" anyone
     * would search for by name, and capturing it would flood the cross-file name index `resolve.ts` uses
     * to settle calls — more names means more collisions, which means more calls silently dropped to
     * `unresolved`. See `resolve.ts`'s "an ambiguous edge is worse than a missing one" rule.
     *
     * This is a property of the *rule*, not of {@link kind} in general: JS/TS's `field_definition` rule
     * (kind `field`) sets this because a class field could in principle sit at any depth a class does —
     * but Go's struct-field rule, also kind `field`, must not, because its enclosing `type_spec` is itself
     * never scope-restricted (a Go type declaration is captured at any depth, like a function), so a
     * scope-restricted struct-field rule could never fire at all. Absent (the common case), always
     * extracted regardless of depth.
     */
    readonly scopeRestricted?: boolean;
    /**
     * Present only when a rule must distinguish two node types that share both their own type and their
     * immediate parent's type — C#'s field vs. local variable both parse as a `variable_declarator`
     * directly inside a `variable_declaration`, and only the *grandparent* differs
     * (`field_declaration` vs. `local_declaration_statement`). Absent, any grandparent matches, the same
     * as an absent {@link parentType}.
     */
    readonly grandparentType?: string;
}
/**
 * Sentinel {@link DefinitionRule.nameField} value for a rule whose matched node has no separate
 * name-bearing child — a bare enum member (`enum_body`'s `Red` in `enum Color { Red }`) parses as a
 * lone `property_identifier` token with no fields of its own; the node itself, unlike every other
 * `nameField` target, *is* the name.
 */
export declare const SELF_NAME_FIELD = "@self";
/**
 * Sentinel {@link DefinitionRule.nameField} value for a rule whose name sits behind an arbitrarily deep
 * chain of C/C++ `declarator` wrappers — `int *make(int a)`'s name is three `declarator` fields down
 * (`pointer_declarator` → `function_declarator` → `identifier`), and a plain `int g` binds its
 * `identifier` directly with no wrapper at all. See `declaratorName` in `extract.ts`, which this
 * sentinel dispatches to instead of a flat `childForFieldName` lookup.
 */
export declare const DECLARATOR_NAME_FIELD = "@declarator";
/**
 * Sentinel {@link DefinitionRule.nameField} value for a rule whose name is its matched node's first
 * named child with no field name of its own — C#'s `variable_declarator` binds neither its name nor its
 * optional initializer to a field at all (`int Field = 5;`'s `variable_declarator` has two purely
 * positional named children, `identifier` then `equals_value_clause`), unlike every other grammar this
 * package extracts a name from. Distinct from {@link SELF_NAME_FIELD}: the matched node's own text
 * would include that initializer (`"Field = 5"`), not just the name. See `firstChildName` in
 * `extract.ts`.
 */
export declare const FIRST_CHILD_NAME_FIELD = "@first-child";
/**
 * Sentinel {@link DefinitionRule.nameField} value for a rule whose name is PHP-specific: a bare `name`
 * node directly (`const_element`'s `VERSION` in `const VERSION = "1"`), or one nested a level deeper
 * inside a `variable_name` child (`property_element`'s `$name` in `public string $name;`, and an
 * `assignment_expression`'s `$fn` in `$fn = function () {}` — both bind their bare `name` behind the
 * same `$`-prefixed wrapper). See `phpElementName` in `extract.ts`, which this sentinel dispatches to
 * instead of a flat `childForFieldName` lookup — none of these three shapes bind their name to a field
 * of its own.
 */
export declare const PHP_ELEMENT_NAME_FIELD = "@php-element";
/**
 * Sentinel {@link DefinitionRule.nameField} value for a rule whose name is Kotlin-specific: the bundled
 * `tree-sitter-kotlin` grammar this package loads binds *no* grammar fields at all (verified against a
 * real parse — `Language.fieldCount`/`fieldNameForId` enumerate zero for it), unlike every other grammar
 * this package extracts from, so a plain `childForFieldName` lookup can never work here regardless of
 * which field name is named. A `class_declaration`'s/`function_declaration`'s/`enum_entry`'s declared
 * name is instead the first direct named child typed `type_identifier` (a class/interface/enum name) or
 * `simple_identifier` (a function/enum-entry name) — found by type rather than by position, since an
 * optional leading `modifiers` node (wrapping `private`/`internal`/…) would otherwise sit at index 0
 * ahead of it. See `kotlinDeclaredName` in `extract.ts`, which this sentinel dispatches to.
 */
export declare const KOTLIN_NAME_FIELD = "@kotlin-name";
/**
 * Sentinel {@link DefinitionRule.nameField} value for a rule whose name is Swift-specific: a
 * `property_declaration`'s own `name` field points to a `pattern` node (`var x: Int`'s `x` sits behind
 * this wrapper, not bound to a field of `property_declaration` directly), and the actual declared
 * identifier is one level deeper still, bound to that `pattern` node's own `bound_identifier` field.
 * See `swiftPropertyName` in `extract.ts`, which this sentinel dispatches to instead of a flat
 * `childForFieldName` lookup. Verified against a real parse, not guessed.
 */
export declare const SWIFT_PROPERTY_NAME_FIELD = "@swift-property";
/**
 * Sentinel {@link DefinitionRule.nameField} value for a rule whose name is Swift-specific in a
 * different way: a `function_declaration`/`protocol_function_declaration` with an explicit return type
 * (`func add() -> Int`) binds *two* nodes to its own `name` field in this grammar build — the declared
 * identifier itself, and (a verified, unguessed quirk of this specific compiled grammar) its
 * `return_type` node as well — so `childrenForFieldName('name')` returns both, failing
 * `soleNamedField`'s "exactly one bound child" uniqueness check the same way Go's genuinely ambiguous
 * `const a, b = 1, 2` does, and silently dropping every such function from this package's graph. Unlike
 * that Go case, this is not a real multi-name ambiguity — the identifier always comes first in document
 * order — so `swiftFunctionName` in `extract.ts` uses `childForFieldName('name')` (first match) instead
 * of `soleNamedField`'s all-matches check.
 */
export declare const SWIFT_FUNCTION_NAME_FIELD = "@swift-function";
/**
 * Sentinel {@link DefinitionRule.nameField} value for a rule whose name is Dart-specific: a `declaration`
 * node is how Dart spells both a class/struct field (`int x;`, wrapping an `initialized_identifier_list`
 * of one or more `initialized_identifier` children, itself the same multi-name ambiguity Go's
 * `const_spec`/`var_spec` already reject outright) and a constructor (wrapping a `constructor_signature`
 * instead, handled by its own separate rule matching that inner node type directly, not this one) — with
 * no field of its own binding either shape, so `dartFieldName` in `extract.ts` returns `undefined` for
 * anything but the single-identifier field-list shape, the same "don't guess" precedent this file already
 * follows elsewhere; a `declaration` wrapping a constructor simply fails to match this rule and is left
 * for the dedicated `constructor_signature` rule to capture during the walk's ordinary recursion into it.
 * Verified against a real parse, not guessed.
 */
export declare const DART_FIELD_NAME_FIELD = "@dart-field";
/** One tree-sitter node type recording a relative-import binding, per language family. */
export interface ImportRule {
    /** The tree-sitter node type anchoring one import statement, e.g. `import_statement`. */
    readonly statementType: string;
}
/** One language grammar this package can load and extract from. */
export interface LanguageSpec {
    /** The seam's language label. See `LANGUAGES` in `dsh-plugin-codegraph-service`. */
    readonly language: string;
    /** File extensions routed to this grammar, each including the leading dot. */
    readonly extensions: readonly string[];
    /** The `tree-sitter-wasms` package-relative wasm file this grammar loads from. */
    readonly wasmFile: string;
    /** Definition rules tried in order for every named node the walk visits. */
    readonly definitions: readonly DefinitionRule[];
    /** Node types whose {@link callFunctionField} names the callee. */
    readonly callTypes: readonly string[];
    /** Field on a call node holding the callee expression, used for any {@link callTypes} member absent
     * from {@link callFunctionFieldByType}. */
    readonly callFunctionField: string;
    /**
     * Present only when different {@link callTypes} members name their callee through different fields —
     * PHP's `member_call_expression` ($obj->method()) and `scoped_call_expression` (Class::method()) both
     * use `name`, while `function_call_expression` uses `function`; every other language's call types
     * (today, always exactly one) share a single field, so this is absent for all of them. Overrides
     * {@link callFunctionField} for the node types it lists.
     */
    readonly callFunctionFieldByType?: Readonly<Record<string, string>>;
    /** Node types anchoring one import statement. */
    readonly importTypes: readonly string[];
    /**
     * Node types that bound a new function scope even when the walk never captures them as a named
     * definition — a callback (`arr.forEach(function(item) { ... })`) or an IIFE's `function_expression`
     * never matches a {@link DefinitionRule} (only a *named* declaration, or one assigned through a
     * captured `variable_declarator`, does), but a `const`/`var` inside its body is exactly the
     * function-local binding a `scopeRestricted` {@link DefinitionRule} exists to exclude. Empty for a language with
     * no anonymous-function shape that can contain a statement (Python's `lambda` body is a single
     * expression, never a block).
     */
    readonly bareFunctionScopeTypes: readonly string[];
}
/** Every grammar this package loads, keyed by the seam language label it produces. */
export declare const LANGUAGE_TABLE: readonly LanguageSpec[];
/**
 * The grammar for a file extension, or `undefined` when this package indexes nothing for it.
 * @param extension - the file extension, including the leading dot, e.g. `.ts`.
 * @returns the matching language's extraction table entry, or `undefined`.
 */
export declare function languageFor(extension: string): LanguageSpec | undefined;
//# sourceMappingURL=languages.d.ts.map
/**
 * Workspace-wide, two-pass call resolution over every file's raw extraction.
 *
 * Pass 1 collects every definition into a name index. Pass 2 resolves each call site's callee name,
 * in order: (1) the enclosing file imports that name from a relative specifier resolving to a file
 * this run indexed — that file's matching declaration wins; (2) otherwise exactly one definition
 * workspace-wide carries the name — it wins; (3) otherwise the call is recorded in `unresolved` and no
 * `calls` edge is written. An ambiguous edge is worse than a missing one: the model acts on `callers`
 * output, so a confidently wrong caller sends it to edit the wrong file, while a missing caller merely
 * sends it back to text search.
 *
 * Rule 3's `unresolved` entries are not one uniform signal. Each carries {@link UnresolvedRef.likelyExternal},
 * which is true for a member call (no type information behind its receiver) or a name the file itself
 * imports (a known external origin the specifier just didn't resolve) — both real code that was never a
 * candidate for a workspace edge, as against a bare, undeclared name, which is the actual gap this
 * resolver's conservative rule leaves behind.
 * @module dsh-plugin-codegraph-tree-sitter/resolve
 */
import { posix } from 'node:path';
/** File extensions tried, in order, when a relative specifier names no extension of its own. */
const RESOLUTION_SUFFIXES = {
    typescript: ['.ts', '.tsx', '.d.ts', '/index.ts', '/index.tsx'],
    tsx: ['.tsx', '.ts', '/index.tsx', '/index.ts'],
    javascript: ['.js', '.jsx', '.mjs', '.cjs', '/index.js', '/index.jsx'],
    jsx: ['.jsx', '.js', '/index.jsx', '/index.js'],
    python: ['.py', '/__init__.py'],
};
/**
 * Resolve a relative import specifier to a file this run indexed.
 * @param fromPath - the importing file's project-relative path.
 * @param specifier - the raw specifier text, e.g. `./bar` or `.bar`.
 * @param language - the importing file's seam language label.
 * @param indexed - every project-relative path this run indexed.
 * @returns the resolved path, or `undefined` when the specifier is not relative, the language has no
 * relative-import convention this package resolves, or nothing indexed matches.
 */
function resolveSpecifier(fromPath, specifier, language, indexed) {
    const suffixes = RESOLUTION_SUFFIXES[language];
    if (suffixes === undefined)
        return undefined;
    const fromDir = posix.dirname(fromPath);
    const base = language === 'python' ? pythonRelativeBase(fromDir, specifier) : ecmascriptRelativeBase(fromDir, specifier);
    if (base === undefined)
        return undefined;
    if (indexed.has(base))
        return base;
    for (const suffix of suffixes) {
        const candidate = `${base}${suffix}`;
        if (indexed.has(candidate))
            return candidate;
    }
    return undefined;
}
/** The ECMAScript relative-import base path, or `undefined` when `specifier` is not relative. */
function ecmascriptRelativeBase(fromDir, specifier) {
    if (!specifier.startsWith('.'))
        return undefined;
    return posix.normalize(posix.join(fromDir, specifier));
}
/** The Python relative-import base path, or `undefined` when `specifier` carries no leading dots. */
function pythonRelativeBase(fromDir, specifier) {
    const match = /^(\.+)(.*)$/.exec(specifier);
    if (match === null)
        return undefined;
    const [, dots = '', rest = ''] = match;
    let dir = fromDir;
    // One dot means "this package" (no directory change); each additional dot climbs one level, matching
    // Python's relative-import level convention.
    for (let level = 1; level < dots.length; level++)
        dir = posix.dirname(dir);
    return rest === '' ? dir : posix.normalize(posix.join(dir, rest.replaceAll('.', '/')));
}
/**
 * A map's value for `key`, asserting it is present. Every call site below looks up a key this same
 * function inserted earlier in the same pass, so absence would mean a bug in that bookkeeping, not
 * data this function must tolerate.
 * @param map - the map to read.
 * @param key - the key, guaranteed present by the caller's own construction.
 * @returns the value.
 */
function mustGet(map, key) {
    const value = map.get(key);
    /* v8 ignore next 2 -- every call site inserts `key` earlier in this same resolution pass. */
    if (value === undefined)
        throw new Error(`codegraph-tree-sitter: resolve.ts expected a value for ${String(key)}`);
    return value;
}
/** The workspace's global declaration name index: every declaration name to the nodes carrying it. */
function buildNameIndex(nodesByFile) {
    const index = new Map();
    for (const nodes of nodesByFile.values()) {
        for (const node of nodes) {
            const existing = index.get(node.name);
            if (existing === undefined)
                index.set(node.name, [node]);
            else
                existing.push(node);
        }
    }
    return index;
}
/**
 * A name index restricted to `class`/`interface` nodes, for `extends`/`implements` resolution.
 * `extractHeritage` only ever names a base class or interface, never a function or variable — indexing
 * only those kinds keeps a same-named function or module-level `const` (`packages/tree-sitter/src/
 * languages.ts` extracts those now too) from ever winning a heritage reference by coincidence, tighter
 * than `buildNameIndex`'s workspace-wide, any-kind index that call resolution already accepts.
 */
function buildTypeNameIndex(nodesByFile) {
    const index = new Map();
    for (const nodes of nodesByFile.values()) {
        for (const node of nodes) {
            if (node.kind !== 'class' && node.kind !== 'interface')
                continue;
            const existing = index.get(node.name);
            if (existing === undefined)
                index.set(node.name, [node]);
            else
                existing.push(node);
        }
    }
    return index;
}
/** Resolve one file's raw imports against the indexed workspace. */
function resolveImports(path, language, imports, indexed) {
    const byLocalName = new Map();
    const targetFiles = new Set();
    for (const binding of imports) {
        const targetFile = resolveSpecifier(path, binding.specifier, language, indexed);
        if (targetFile === undefined)
            continue;
        targetFiles.add(targetFile);
        if (binding.importedName !== '*')
            byLocalName.set(binding.localName, { targetFile, importedName: binding.importedName });
    }
    return { byLocalName, targetFiles };
}
/**
 * Resolve every file's raw extraction into the workspace graph.
 * @param files - every file this run parsed, with its raw extraction.
 * @param now - epoch milliseconds recorded as every node's `updatedAt`.
 * @returns the resolved nodes, edges, and unresolved call sites.
 */
export function resolveWorkspace(files, now) {
    const indexed = new Set(files.map(file => file.path));
    const nodesByFile = new Map();
    const fileNodeId = new Map();
    const defIdByKey = new Map();
    const nodes = [];
    const edges = [];
    for (const file of files) {
        const id = `file:${file.path}`;
        fileNodeId.set(file.path, id);
        const fileNode = {
            id,
            kind: 'file',
            name: posix.basename(file.path),
            qualifiedName: file.path,
            filePath: file.path,
            language: file.language,
            startLine: 1,
            endLine: Math.max(1, file.lineCount),
            startColumn: 0,
            endColumn: 0,
            isExported: false,
            isAsync: false,
            isStatic: false,
            decorators: [],
            updatedAt: now,
        };
        nodes.push(fileNode);
        const keyToId = new Map();
        const fileNodes = [];
        for (const def of file.extraction.definitions) {
            const qualifiedName = def.container.length === 0
                ? `${file.path}::${def.name}`
                : `${file.path}::${[...def.container, def.name].join('.')}`;
            const nodeId = `${file.path}:${def.startLine}:${def.startColumn}`;
            keyToId.set(def.key, nodeId);
            fileNodes.push({
                id: nodeId,
                kind: def.kind,
                name: def.name,
                qualifiedName,
                filePath: file.path,
                language: file.language,
                startLine: def.startLine,
                endLine: def.endLine,
                startColumn: def.startColumn,
                endColumn: def.endColumn,
                isExported: def.isExported,
                isAsync: def.isAsync,
                isStatic: def.isStatic,
                decorators: def.decorators,
                updatedAt: now,
            });
        }
        nodes.push(...fileNodes);
        nodesByFile.set(file.path, fileNodes);
        defIdByKey.set(file.path, keyToId);
        for (const def of file.extraction.definitions) {
            const source = def.parentKey === null ? id : mustGet(keyToId, def.parentKey);
            edges.push({ source, target: mustGet(keyToId, def.key), kind: 'contains', provenance: 'tree-sitter' });
        }
    }
    const nameIndex = buildNameIndex(nodesByFile);
    const typeNameIndex = buildTypeNameIndex(nodesByFile);
    const unresolved = [];
    for (const file of files) {
        const bindings = resolveImports(file.path, file.language, file.extraction.imports, indexed);
        for (const target of bindings.targetFiles) {
            edges.push({ source: mustGet(fileNodeId, file.path), target: mustGet(fileNodeId, target), kind: 'imports', provenance: 'tree-sitter' });
        }
        const keyToId = mustGet(defIdByKey, file.path);
        const importedLocalNames = new Set(file.extraction.imports.map(binding => binding.localName));
        for (const call of file.extraction.calls) {
            const callerId = call.callerKey === null ? mustGet(fileNodeId, file.path) : mustGet(keyToId, call.callerKey);
            const resolved = resolveName(call.calleeName, bindings, nodesByFile, nameIndex);
            if (resolved === undefined) {
                const likelyExternal = call.isMemberCall || importedLocalNames.has(call.calleeName);
                unresolved.push({ source: callerId, filePath: file.path, calleeName: call.calleeName, line: call.line, col: call.column, likelyExternal });
                continue;
            }
            edges.push({ source: callerId, target: resolved, kind: 'calls', line: call.line, col: call.column, provenance: 'tree-sitter' });
        }
        // An unresolved `extends`/`implements` reference is dropped silently, not routed through
        // `unresolved` — that array (and the `unresolvedCount`/`unresolvedLikelyInternalCount` split built
        // on it) is a calibrated signal specifically about call-resolution gaps; folding in a different edge
        // kind would change what that count measures.
        for (const ref of file.extraction.heritage) {
            const resolved = resolveName(ref.targetName, bindings, nodesByFile, typeNameIndex);
            if (resolved === undefined)
                continue;
            edges.push({ source: mustGet(keyToId, ref.sourceKey), target: resolved, kind: ref.relation, provenance: 'tree-sitter' });
        }
    }
    return { nodes, edges, unresolved };
}
/**
 * Resolve a bare name to exactly one declaration, or `undefined` per rule 3 — shared by call
 * resolution (against the workspace-wide, any-kind `nameIndex`) and `extends`/`implements` resolution
 * (against the `class`/`interface`-only {@link buildTypeNameIndex}); the two-tier rule itself (an
 * imported binding wins if unambiguous in its target file, else a workspace-wide-unique name wins) does
 * not depend on which candidate pool the caller passes in.
 */
function resolveName(calleeName, bindings, nodesByFile, nameIndex) {
    const bound = bindings.byLocalName.get(calleeName);
    if (bound !== undefined) {
        const targetNodes = mustGet(nodesByFile, bound.targetFile);
        const candidates = bound.importedName === 'default'
            ? targetNodes.filter(node => node.isExported)
            : targetNodes.filter(node => node.name === bound.importedName);
        if (candidates.length === 1)
            return candidates[0]?.id;
    }
    const workspaceWide = nameIndex.get(calleeName) ?? [];
    return workspaceWide.length === 1 ? workspaceWide[0]?.id : undefined;
}
//# sourceMappingURL=resolve.js.map
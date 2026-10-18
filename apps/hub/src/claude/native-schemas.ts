import { mkdtemp, mkdir, open, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { createGenerator, ts } from 'ts-json-schema-generator';
import { JSON_VALUE, type JsonValue } from '@smarteverything/domain';
import { z } from 'zod';

const MAX_DECLARATION_BYTES = 4 * 1024 * 1024;
const SCHEMA_ROOT = z.looseObject({
  properties: z.record(z.string(), z.record(z.string(), JSON_VALUE)),
  definitions: z.record(z.string(), JSON_VALUE).optional(),
});

class NativeSchemaError extends Error {
  override readonly name = 'NativeSchemaError';
}

export async function nativeSchemas(
  root: string,
  scratch: string,
): Promise<ReadonlyMap<string, Record<string, JsonValue>>> {
  if (!isAbsolute(root)) {
    throw new NativeSchemaError('The native plugin root must be absolute.');
  }
  const types = join(root, '.claude-plugin', 'types');
  const engine = join(types, 'claude-code', 'index.d.ts');
  const mcp = join(types, 'claude-code-mcp', 'index.d.ts');
  await Promise.all([readDeclaration(engine), readDeclaration(mcp)]);
  await mkdir(scratch, { recursive: true, mode: 0o700 });
  const temporary = await mkdtemp(join(scratch, 'native-schema-'));
  try {
    return await generateSchemas(temporary, engine, mcp);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

async function readDeclaration(path: string): Promise<void> {
  const handle = await open(path, 'r');
  try {
    const size = (await handle.stat()).size;
    if (size === 0 || size > MAX_DECLARATION_BYTES)
      throw new NativeSchemaError(
        'The installed native tool declarations are empty or exceed the parsing limit.',
      );
  } finally {
    await handle.close();
  }
}

async function generateSchemas(
  temporary: string,
  engine: string,
  mcp: string,
): Promise<ReadonlyMap<string, Record<string, JsonValue>>> {
  const wrapper = join(temporary, 'native.ts');
  const config = join(temporary, 'tsconfig.json');
  await writeFile(wrapper, mergedInputs(engine, mcp), { mode: 0o600 });
  await writeFile(
    config,
    JSON.stringify({
      compilerOptions: {
        strict: true,
        skipLibCheck: true,
        moduleResolution: 'bundler',
        module: 'esnext',
        paths: { 'claude-code': [engine] },
        types: [],
      },
      files: [wrapper, engine, mcp],
    }),
    { mode: 0o600 },
  );
  const generated = createGenerator({
    path: wrapper,
    tsconfig: config,
    type: 'NativeToolInputs',
    topRef: false,
    expose: 'all',
    functions: 'fail',
  }).createSchema('NativeToolInputs');
  const schema = SCHEMA_ROOT.parse(generated);
  return new Map(
    Object.entries(schema.properties).map(([name, property]) => {
      const root = resolveRoot(property, schema.definitions);
      const definitions = reachableDefinitions(root, schema.definitions);
      return [name, { ...root, ...(Object.keys(definitions).length === 0 ? {} : { definitions }) }];
    }),
  );
}

function mergedInputs(engine: string, mcp: string): string {
  const program = ts.createProgram([engine, mcp], { strict: true, skipLibCheck: true });
  const checker = program.getTypeChecker();
  const module = checker.getAmbientModules().find((entry) => entry.name === '"claude-code"');
  if (module === undefined)
    throw new NativeSchemaError('The installed declarations do not export claude-code.');
  const exports = checker.getExportsOfModule(module);
  const fields = ['BuiltinToolInputs', 'McpToolInputs'].flatMap((name) => {
    const symbol = exports.find((entry) => entry.name === name);
    if (symbol === undefined)
      throw new NativeSchemaError(`The installed declarations do not export ${name}.`);
    return checker
      .getDeclaredTypeOfSymbol(symbol)
      .getProperties()
      .map((property) => {
        const declaration = property.valueDeclaration ?? property.declarations?.[0];
        if (declaration === undefined)
          throw new NativeSchemaError(`The native tool ${property.name} has no input declaration.`);
        const type = checker.getTypeOfSymbolAtLocation(property, declaration);
        const shape = checker.typeToString(
          type,
          declaration,
          ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.InTypeAlias,
        );
        return `${JSON.stringify(property.name)}: ${shape};`;
      });
  });
  if (fields.length === 0)
    throw new NativeSchemaError('The installed merged native tool declarations contain no tools.');
  const imported = exports
    .map((entry) => entry.name)
    .filter((name) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name));
  return `import type {${imported.join(',')}} from 'claude-code';\nexport type NativeToolInputs = {${fields.join('\n')}};\n`;
}

function resolveRoot(
  property: Record<string, JsonValue>,
  definitions: Record<string, JsonValue> | undefined,
): Record<string, JsonValue> {
  let current = property;
  const visited = new Set<string>();
  while (current['$ref'] !== undefined) {
    const reference = current['$ref'];
    if (
      typeof reference !== 'string' ||
      !reference.startsWith('#/definitions/') ||
      definitions === undefined
    )
      throw new NativeSchemaError('A native tool input has an unresolved root schema reference.');
    const name = definitionName(reference);
    if (visited.has(name))
      throw new NativeSchemaError('A native input root schema has a circular alias.');
    visited.add(name);
    const root = z.record(z.string(), JSON_VALUE).parse(definitions[name]);
    const { $ref: _reference, ...fields } = current;
    current = { ...root, ...fields };
  }
  return current;
}

function definitionName(reference: string): string {
  return decodeURIComponent(reference.slice('#/definitions/'.length))
    .replaceAll('~1', '/')
    .replaceAll('~0', '~');
}

function reachableDefinitions(
  root: Record<string, JsonValue>,
  definitions: Record<string, JsonValue> | undefined,
): Record<string, JsonValue> {
  const retained: Record<string, JsonValue> = {};
  const queued: JsonValue[] = [root];
  while (queued.length > 0) {
    const value = queued.pop();
    if (Array.isArray(value)) {
      queued.push(...z.array(JSON_VALUE).parse(value));
      continue;
    }
    const parsed = z.record(z.string(), JSON_VALUE).safeParse(value);
    if (!parsed.success) continue;
    const fields = parsed.data;
    const reference = fields['$ref'];
    if (typeof reference === 'string' && reference.startsWith('#/definitions/')) {
      const name = definitionName(reference);
      if (!Object.hasOwn(retained, name)) {
        const definition = definitions?.[name];
        if (definition === undefined)
          throw new NativeSchemaError(`The native schema definition ${name} is missing.`);
        retained[name] = definition;
        queued.push(definition);
      }
    }
    queued.push(...Object.values(fields));
  }
  return retained;
}

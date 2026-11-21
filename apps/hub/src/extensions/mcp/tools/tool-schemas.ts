import generated from './tool-schemas.json' with { type: 'json' };
import { TOOL_SCHEMA_FILE, type ToolSchemaEntry, type ToolSchemas } from './built-tools';
import type { Tool, ToolSchema } from './registry';

export const TOOL_SCHEMAS_COMMAND = 'node --import tsx tooling/generate-mcp-tool-schemas.ts';

export class ToolSchemasStaleError extends Error {
  override readonly name = 'ToolSchemasStaleError';

  constructor(problem: string) {
    super(`The generated MCP tool schemas are stale: ${problem}. Run ${TOOL_SCHEMAS_COMMAND}.`);
  }
}

function variantSchema(tool: string, value: string, entry: ToolSchemaEntry): ToolSchema {
  const schema = entry.variants?.[value];
  if (schema === undefined) {
    throw new ToolSchemasStaleError(`${tool} has no schema for its variant ${value}`);
  }
  return schema;
}

function withSchemas(tool: Tool, entry: ToolSchemaEntry): Tool {
  const { name, title, description, annotations } = tool.listing;
  const variants = tool.variants;
  if (Object.keys(entry.variants ?? {}).length !== (variants?.size ?? 0)) {
    throw new ToolSchemasStaleError(`${tool.name} lists other variants than the tool has`);
  }
  return {
    ...tool,
    listing: { name, title, description, inputSchema: entry.inputSchema, annotations },
    ...(variants === undefined
      ? {}
      : {
          variants: new Map(
            [...variants].map(([value, variant]) => [
              value,
              {
                selector: variant['selector'],
                inputSchema: variantSchema(tool.name, value, entry),
                annotations: variant['annotations'],
              },
            ]),
          ),
        }),
  };
}

export const GENERATED_TOOL_SCHEMAS: ToolSchemas = TOOL_SCHEMA_FILE.parse(generated);

export function withGeneratedSchemas(
  tools: readonly Tool[],
  schemas: ToolSchemas,
): readonly Tool[] {
  const names = new Set(tools.map((tool) => tool.name));
  const extra = Object.keys(schemas).filter((name) => !names.has(name));
  if (extra.length > 0) {
    throw new ToolSchemasStaleError(`no tool is named ${extra.join(', ')}`);
  }
  return tools.map((tool) => {
    const entry = schemas[tool.name];
    if (entry === undefined) {
      throw new ToolSchemasStaleError(`${tool.name} has no schema`);
    }
    return withSchemas(tool, entry);
  });
}

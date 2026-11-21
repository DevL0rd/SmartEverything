import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderMcpToolSchemas, TOOL_SCHEMAS_FILE } from '../generate-mcp-tool-schemas.ts';
import {
  builtTools,
  computedSchemas,
} from '../../apps/hub/src/extensions/mcp/tools/built-tools.ts';
import { TOOLS } from '../../apps/hub/src/extensions/mcp/tools/index.ts';
import {
  ToolSchemasStaleError,
  TOOL_SCHEMAS_COMMAND,
  withGeneratedSchemas,
} from '../../apps/hub/src/extensions/mcp/tools/tool-schemas.ts';

const unserved = (): never => {
  throw new Error('not served in this test');
};

describe('the generated MCP tool schemas', () => {
  it(`match the tools of this build (run ${TOOL_SCHEMAS_COMMAND})`, () => {
    expect(readFileSync(TOOL_SCHEMAS_FILE, 'utf8')).toBe(renderMcpToolSchemas());
  });

  it('give every served tool and variant the schema its definition builds', () => {
    const built = builtTools(unserved);
    const computed = computedSchemas(built);
    expect(TOOLS.map((tool) => tool.name)).toEqual(built.map((tool) => tool.name));
    for (const tool of TOOLS) {
      expect(tool.listing.inputSchema, tool.name).toEqual(computed[tool.name]?.inputSchema);
      for (const [value, variant] of tool.variants ?? []) {
        expect(variant['inputSchema'], `${tool.name} ${value}`).toEqual(
          computed[tool.name]?.variants?.[value],
        );
      }
    }
  });

  it('refuse a schema file that misses a tool or names one that does not exist', () => {
    const built = builtTools(unserved);
    const computed = computedSchemas(built);
    const [first] = built;
    if (first === undefined) throw new Error('no tools');
    const { [first.name]: _missing, ...without } = computed;
    expect(() => withGeneratedSchemas(built, without)).toThrow(ToolSchemasStaleError);
    expect(() =>
      withGeneratedSchemas(built, { ...computed, gone_tool: { inputSchema: {} } }),
    ).toThrow(ToolSchemasStaleError);
  });
});

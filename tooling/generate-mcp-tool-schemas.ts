import { rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { builtTools, computedSchemas } from '../apps/hub/src/extensions/mcp/tools/built-tools.ts';

export const TOOL_SCHEMAS_FILE = join(
  import.meta.dirname,
  '..',
  'apps',
  'hub',
  'src',
  'extensions',
  'mcp',
  'tools',
  'tool-schemas.json',
);

export class ServedListUnavailableError extends Error {
  override readonly name = 'ServedListUnavailableError';

  constructor() {
    super('The served tool list is not available while the tool schemas are generated.');
  }
}

export function renderMcpToolSchemas(): string {
  const tools = builtTools(() => {
    throw new ServedListUnavailableError();
  });
  return `${JSON.stringify(computedSchemas(tools), null, 2)}\n`;
}

async function save(): Promise<void> {
  const staging = `${TOOL_SCHEMAS_FILE}.tmp`;
  await writeFile(staging, renderMcpToolSchemas());
  await rename(staging, TOOL_SCHEMAS_FILE);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await save();

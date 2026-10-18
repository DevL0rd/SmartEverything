import type { ListResourcesResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { catalogueText } from '../../ai-tools/catalogue-text';
import type { Tool } from './tools/registry';

const TOOLS_DOC_URI = 'smarteverything://docs/tools';

const LISTED = z.looseObject({
  name: z.string(),
  description: z.string(),
  inputSchema: z.record(z.string(), z.unknown()),
});

export function resourceList(): ListResourcesResult {
  return {
    resources: [
      {
        uri: TOOLS_DOC_URI,
        name: 'tools',
        title: 'SmartEverything tools',
        description: 'Every tool of this server as name(parameters): what it is.',
        mimeType: 'text/plain',
      },
    ],
  };
}

export function resourceRead(uri: string, tools: readonly Tool[]): ReadResourceResult | null {
  if (uri !== TOOLS_DOC_URI) {
    return null;
  }
  const text = catalogueText(tools.map((tool) => LISTED.parse(tool.listing)));
  return { contents: [{ uri: TOOLS_DOC_URI, mimeType: 'text/plain', text }] };
}

import { z } from 'zod';
import { catalogueText } from '../../ai-tools/catalogue-text';
import type { Tool } from './tools/registry';

export const TOOLS_DOC_URI = 'smarteverything://docs/tools';

const LISTED = z.looseObject({
  name: z.string(),
  description: z.string(),
  inputSchema: z.record(z.string(), z.unknown()),
});

const READ = z.object({ uri: z.string() });

export function resourceList(): Readonly<Record<string, unknown>> {
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

export function resourceRead(
  params: unknown,
  tools: readonly Tool[],
): Readonly<Record<string, unknown>> | null {
  const read = READ.safeParse(params);
  if (!read.success || read.data.uri !== TOOLS_DOC_URI) {
    return null;
  }
  const text = catalogueText(tools.map((tool) => LISTED.parse(tool.listing)));
  return { contents: [{ uri: TOOLS_DOC_URI, mimeType: 'text/plain', text }] };
}

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const SOURCE = `
import { createInterface } from 'node:readline';
const send = (message) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\\n');
const tool = (name) => ({ name, description: name, inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } });
const TOOLS = ['list_things', 'list_down', 'list_bad', 'hidden_list'].map(tool);
function call(params) {
  if (params.name === 'list_down') {
    return { isError: true, content: [{ type: 'text', text: 'The service is not signed in' }] };
  }
  if (params.name === 'list_bad') {
    return { content: [{ type: 'text', text: 'x' }], structuredContent: { nope: 1 } };
  }
  const page = {
    state: 'ready',
    options: [{ id: 't1', label: JSON.stringify(params.arguments), detail: null, color: null, image: null }],
    next: null,
  };
  return { content: [{ type: 'text', text: 'listed' }], structuredContent: page };
}
function answer(request) {
  if (request.method === 'initialize') {
    return {
      protocolVersion: request.params.protocolVersion,
      capabilities: { tools: { listChanged: true } },
      serverInfo: { name: 'fake-lists', version: '1.0.0' },
    };
  }
  if (request.method === 'tools/list') return { tools: TOOLS };
  if (request.method === 'tools/call') return call(request.params);
  return {};
}
createInterface({ input: process.stdin }).on('line', (line) => {
  const request = JSON.parse(line);
  if (request.id !== undefined) send({ id: request.id, result: answer(request) });
});
`;

export async function writeFakeListsPlugin(directory: string): Promise<string> {
  const path = join(directory, 'fake-lists-plugin.mjs');
  await writeFile(path, SOURCE);
  return path;
}

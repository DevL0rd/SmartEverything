import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const SOURCE = `
import { createInterface } from 'node:readline';
const send = (message) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\\n');
const text = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
const TOOLS = [
  { name: 'echo', description: 'Echo', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },
  { name: 'crash', description: 'Exit', inputSchema: { type: 'object' } },
];
const MESSAGE = {
  eventId: 'e1',
  conversation: { key: 'general', title: '#general' },
  text: 'hello',
  from: { id: '42', name: 'Sam' },
  reply: { tool: 'send' },
};
function call(params) {
  if (params.name === 'crash') {
    process.exit(1);
  }
  return text({
    said: params.arguments.text,
    url: process.env.SMARTEVERYTHING_MCP_URL ?? null,
    token: process.env.SMARTEVERYTHING_TOKEN ?? null,
  });
}
function answer(request) {
  if (request.method === 'initialize') {
    return {
      protocolVersion: request.params.protocolVersion,
      capabilities: { tools: { listChanged: true } },
      serverInfo: { name: 'fake', version: '1.0.0' },
    };
  }
  if (request.method === 'tools/list') {
    return { tools: TOOLS };
  }
  if (request.method === 'tools/call') {
    return call(request.params);
  }
  return {};
}
createInterface({ input: process.stdin }).on('line', (line) => {
  const request = JSON.parse(line);
  if (request.method === 'notifications/initialized') {
    process.stderr.write('ready\\n');
    send({ method: 'notifications/smarteverything/message', params: MESSAGE });
    return;
  }
  if (request.id !== undefined) {
    send({ id: request.id, result: answer(request) });
  }
});
`;

export async function writeFakePlugin(directory: string): Promise<string> {
  const path = join(directory, 'fake-plugin.mjs');
  await writeFile(path, SOURCE);
  return path;
}

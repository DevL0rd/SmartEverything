import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

describe('@anthropic-ai/claude-agent-sdk contract', () => {
  it('turns a tool definition with a Zod shape into an in-process server the hub hands to a query', () => {
    const server = createSdkMcpServer({
      name: 'home',
      version: '1.0.0',
      tools: [
        {
          name: 'turn_on',
          description: 'Turn a device on',
          inputSchema: { id: z.string() },
          handler: (): Promise<{ content: { type: 'text'; text: string }[] }> =>
            Promise.resolve({ content: [{ type: 'text', text: 'ok' }] }),
        },
      ],
    });

    expect(server.type).toBe('sdk');
    expect(server.name).toBe('home');
    expect(server.instance).toBeTypeOf('object');
  });

  it('forwards cancelQueued on an interrupt, which the typings do not declare yet', () => {
    const bundle = readFileSync(
      createRequire(import.meta.url).resolve('@anthropic-ai/claude-agent-sdk'),
      'utf8',
    );

    expect(bundle).toContain('cancel_queued:!0');
    expect(bundle).toContain('cancelQueued===!0');
  });
});

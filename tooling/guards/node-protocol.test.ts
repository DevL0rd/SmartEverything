import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  HUB_FRAME,
  HUB_RUNTIME_CONTROL,
  NODE_FRAME,
  NODE_HELLO,
  NODE_PROTOCOL_VERSION,
  NODE_RUNTIME_FRAME,
} from '@smarteverything/domain';

const STORED = z
  .strictObject({ protocol: z.int().positive(), hash: z.string().regex(/^[0-9a-f]{64}$/) })
  .parse(JSON.parse(readFileSync(join(import.meta.dirname, 'node-protocol.json'), 'utf8')));

const FRAMES = {
  hello: NODE_HELLO,
  node: NODE_FRAME,
  hub: HUB_FRAME,
  nodeRuntime: NODE_RUNTIME_FRAME,
  hubRuntime: HUB_RUNTIME_CONTROL,
};

function frameHash(): string {
  const schemas = Object.entries(FRAMES).map(([name, schema]) => [
    name,
    z.toJSONSchema(schema, { unrepresentable: 'any', io: 'input' }),
  ]);
  return createHash('sha256').update(JSON.stringify(schemas)).digest('hex');
}

describe('node protocol', () => {
  it('changes the frame schemas only together with NODE_PROTOCOL_VERSION', () => {
    expect(
      { protocol: NODE_PROTOCOL_VERSION, hash: frameHash() },
      'Node frame schemas changed: raise NODE_PROTOCOL_VERSION and store the new protocol and hash in tooling/guards/node-protocol.json.',
    ).toStrictEqual(STORED);
  });

  it('puts the protocol number in the hello and no role', () => {
    const shape = Object.keys(NODE_HELLO.shape);
    expect(shape).toContain('protocol');
    expect(shape).not.toContain('role');
  });
});

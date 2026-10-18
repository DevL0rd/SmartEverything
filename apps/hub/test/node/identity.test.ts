import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { computerMachineId, nodeIdentity } from '../../src/node/identity';

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'node-identity-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('computerMachineId', () => {
  it('is the machine id the node announces to the home', async () => {
    const hello = await nodeIdentity(directory);
    expect(await computerMachineId(directory)).toBe(hello.machineId);
    expect(hello.machineId).toMatch(/^[0-9a-f]{32}$/);
  });

  it('is the same on every ask', async () => {
    expect(await computerMachineId(directory)).toBe(await computerMachineId(directory));
  });
});

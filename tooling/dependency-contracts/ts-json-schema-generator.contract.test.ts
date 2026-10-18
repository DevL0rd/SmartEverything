import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createGenerator, ts } from 'ts-json-schema-generator';

const folder = mkdtempSync(join(tmpdir(), 'schema-contract-'));
afterAll(() => {
  rmSync(folder, { recursive: true, force: true });
});

describe('ts-json-schema-generator contract', () => {
  it('turns a declared type into a JSON schema with its required and optional fields', () => {
    const source = join(folder, 'inputs.ts');
    const config = join(folder, 'tsconfig.json');
    writeFileSync(
      source,
      "export type Inputs = { command: string; timeout?: number; mode: 'fast' | 'slow' };\n",
    );
    writeFileSync(config, JSON.stringify({ compilerOptions: { strict: true }, files: [source] }));

    const schema = createGenerator({
      path: source,
      tsconfig: config,
      type: 'Inputs',
      topRef: false,
      expose: 'all',
      functions: 'fail',
    }).createSchema('Inputs');

    expect(schema).toMatchObject({
      type: 'object',
      required: ['command', 'mode'],
      properties: { timeout: { type: 'number' }, mode: { enum: ['fast', 'slow'] } },
    });
  });

  it('exposes the compiler it was built with, which the hub uses to merge declarations', () => {
    expect(ts.createProgram).toBeTypeOf('function');
  });
});

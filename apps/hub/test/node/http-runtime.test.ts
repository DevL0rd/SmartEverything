import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { configureComputerHttp } from '../../src/node/http-runtime';

const dispatcher = vi.hoisted(() => ({
  options: new Array<Readonly<Record<string, unknown>>>(),
  installed: vi.fn(),
}));

vi.mock('undici', () => ({
  Agent: class {
    constructor(readonly options: Readonly<Record<string, unknown>>) {
      dispatcher.options.push(options);
    }
  },
  setGlobalDispatcher: dispatcher.installed,
}));

describe('Computer HTTP runtime', () => {
  it('sets only protocol negotiation policy on the process default dispatcher', () => {
    configureComputerHttp();

    expect(dispatcher.options).toEqual([{ allowH2: false }]);
    expect(dispatcher.installed).toHaveBeenCalledExactlyOnceWith({
      options: { allowH2: false },
    });
  });

  it('configures networking before Computer pairing, supervision or service startup', () => {
    const entry = readFileSync(
      new URL('../../../desktop/packaging/computer/entry.ts', import.meta.url),
      'utf8',
    );
    expect(entry).toMatch(
      /async function main\(\): Promise<void> \{\s+configureComputerHttp\(\);\s+const node =/u,
    );
  });
});

import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import type { HubFrame } from '@smarteverything/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { localComputerFactory } from '../../src/computers/local-computer';
import { pipeLink } from '../../src/node/link';
import { captureLogs, testLogger } from '../support/logs';

let folder: string;
let script: string;

beforeAll(async () => {
  folder = await mkdtemp(
    join(fileURLToPath(new URL('../../', import.meta.url)), '.local-computer-'),
  );
  script = join(folder, 'local-computer-worker.mjs');
  const source = new URL('../../src/computers/local-computer-worker.ts', import.meta.url);
  await build({
    entryPoints: [fileURLToPath(source)],
    outfile: script,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    logLevel: 'silent',
    external: ['x11', 'sharp'],
    banner: {
      js: [
        'import { createRequire as bannerRequire } from "node:module";',
        'import { fileURLToPath as bannerPath } from "node:url";',
        'import { dirname as bannerDirname } from "node:path";',
        'const require = bannerRequire(import.meta.url);',
        'const __filename = bannerPath(import.meta.url);',
        'const __dirname = bannerDirname(__filename);',
      ].join(' '),
    },
  });
}, 60_000);

afterAll(async () => {
  await rm(folder, { recursive: true, force: true });
});

describe('the Hub computer in its own thread', () => {
  it('greets the Hub through the link and relays its logs to the Hub log', async () => {
    const logs = captureLogs();
    const frames: unknown[] = [];
    let greet = (): void => undefined;
    const greeted = new Promise<void>((resolve) => {
      greet = resolve;
    });
    const pipe = pipeLink<unknown, HubFrame>((frame) => {
      frames.push(frame);
      greet();
    });
    const computer = localComputerFactory({
      script,
      machineId: 'hub-machine',
      log: testLogger('computers'),
    })(pipe.link);
    computer.start();
    await greeted;
    computer.stop();
    expect(frames[0]).toMatchObject({ type: 'hello' });
    expect(frames[0]).toHaveProperty('hello.protocol');
    expect(logs.events()).toContain('computer.local_worker_started');
    expect(logs.events()).toContain('node.computer_starting');
  }, 30_000);
});

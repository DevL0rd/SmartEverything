import type { HubFrame } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SessionPlacements } from '../../src/computers/computer-placements';
import type { ServerExtension } from '../../src/extensions';
import type { RunningServer } from '../../src/start';
import { bootServer } from '../support/booted';
import { captureLogs } from '../support/logs';
import { temporaryDirectory } from '../support/server';

let directory: Awaited<ReturnType<typeof temporaryDirectory>>;
let server: RunningServer | null = null;

beforeEach(async () => {
  captureLogs();
  directory = await temporaryDirectory();
});

afterEach(async () => {
  await server?.stop();
  server = null;
  await directory.remove();
});

describe('computer placements during hub startup', () => {
  it('opens a computer session immediately inside an extension before serving clients', async () => {
    const sent: HubFrame[] = [];
    const extension: ServerExtension = (context) => {
      const session = new SessionPlacements({
        placements: context.computerPlacements,
        send: (frame): void => {
          sent.push(frame);
        },
        mountsDemanded: (): boolean => false,
        log: context.log,
      });
      session.open('0a000000-0000-4000-8000-000000000001');
      return Promise.resolve({
        endpoints: {},
        routes: [],
        stop: (): Promise<void> => {
          session.close();
          return Promise.resolve();
        },
      });
    };
    const booted = await bootServer(directory.path, { extensions: [extension] });
    server = booted.server;
    expect(sent).toEqual([{ type: 'placements', placements: [] }]);
    expect((await fetch(`${booted.base}/status`)).status).toBe(200);
  });
});

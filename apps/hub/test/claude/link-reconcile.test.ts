import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  COMPUTER_AI_SETTINGS,
  type ClaudeLink,
  DEFAULT_COMPUTER_AI_SETTINGS,
  type ComputerAiSettings,
} from '@smarteverything/domain';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { createClaudeHost } from '../../src/claude/host';
import { LinkPlane } from '../../src/claude/link-plane';
import { claudeLocations } from '../../src/claude/locations';
import { ClaudeService } from '../../src/claude/service';
import { FakeClock } from '../support/fake-clock';
import { testLogger } from '../support/logs';

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hub-claude-reconcile-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

class CountingService extends ClaudeService {
  installs = 0;

  override installLink(): Promise<ClaudeLink> {
    this.installs += 1;
    return Promise.resolve({ state: 'installed' });
  }
}

function settings(enabled: boolean, autoLink: boolean): ComputerAiSettings {
  return COMPUTER_AI_SETTINGS.parse({
    ...DEFAULT_COMPUTER_AI_SETTINGS,
    control: { enabled, auto_link: autoLink, mcp_areas: null },
  });
}

function hostWith(initial: ComputerAiSettings): {
  configure: (next: ComputerAiSettings) => Promise<unknown>;
  service: CountingService;
} {
  const clock = new FakeClock('2026-11-14T00:00:00.000Z');
  const log = testLogger();
  const plane = new LinkPlane({
    credential: {
      verify: (): boolean => true,
      read: (): Promise<string | null> => Promise.resolve('token'),
      ensure: (): Promise<string> => Promise.resolve('token'),
      revoke: (): Promise<void> => Promise.resolve(),
      retireBridge: (): number => 0,
    },
    clock,
    log,
    directory,
    launch: { command: 'node', script: 'helper.mjs', directory, ready: join(directory, 'ready') },
    cli: (): Promise<string> => Promise.resolve('[]'),
    readUrl: (): Promise<string> => Promise.resolve('http://127.0.0.1:1'),
    raised: (): undefined => undefined,
  });
  const service = new CountingService({
    locations: claudeLocations(directory),
    historyDirectory: directory,
    plane,
    clock,
    publish: (): undefined => undefined,
    log,
  });
  const host = createClaudeHost({
    service,
    plane,
    deviceId: 'computer',
    sites: { directory, ready: join(directory, 'ready'), home: directory },
    log,
    settings: initial,
  });
  return {
    configure: (next): Promise<unknown> => host.execute({ operation: 'configure', settings: next }),
    service,
  };
}

it('installs the link again on a repeat configure while control and auto link stay on', async () => {
  const { configure, service } = hostWith(settings(true, true));
  await configure(settings(true, true));
  await configure(settings(true, true));
  expect(service.installs).toBe(2);
});

it('does not install the link while control or auto link is off', async () => {
  const { configure, service } = hostWith(settings(true, true));
  await configure(settings(false, true));
  await configure(settings(true, false));
  await configure(settings(false, false));
  expect(service.installs).toBe(0);
});

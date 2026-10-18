import {
  AI_HARNESS_CONFIGURATION_HOST_STATUS,
  HARNESS_EXTENSION_ITEM,
  type AiHarnessConfigurationHostStatus,
  type HarnessDesiredConfiguration,
  type HarnessExtensionItem,
  type HarnessPluginReadiness,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { deviceStatus, devicesSummary, itemSummary } from './status';

const RUNTIME = '00000000-0000-4000-8000-0000000000a1';
const CONNECTION = '00000000-0000-4000-8000-0000000000a2';
const NOW = '2026-10-17T10:00:00.000Z';

function readiness(id: string, state: HarnessPluginReadiness['state']): HarnessPluginReadiness {
  return {
    id,
    package: `pkg-${id}`,
    requestedVersion: '1',
    installedVersion: state === 'ready' ? '1' : null,
    provenance: null,
    state,
    reason: null,
  };
}

function host(rows: readonly HarnessPluginReadiness[]): AiHarnessConfigurationHostStatus {
  return AI_HARNESS_CONFIGURATION_HOST_STATUS.parse({
    target: { kind: 'server' },
    online: true,
    runtime_instance: RUNTIME,
    connection_generation: CONNECTION,
    freshness: 'current',
    report: {
      target: { kind: 'server' },
      runtime_instance: RUNTIME,
      connection_generation: CONNECTION,
      revision: 'r1',
      readiness: rows,
      reported_at: NOW,
      received_at: NOW,
    },
  });
}

function item(overrides: Partial<HarnessExtensionItem>): HarnessExtensionItem {
  return HARNESS_EXTENSION_ITEM.parse({
    id: 'browser',
    kind: 'builtin',
    name: 'Browser',
    description: 'Browse',
    publisher: 'SmartEverything',
    license: null,
    platforms: ['linux'],
    capabilities: [],
    requirements: [],
    enabled: true,
    config: {},
    source: { kind: 'included' },
    version: '1',
    executes: false,
    confirmed: false,
    ...overrides,
  });
}

const DESIRED: HarnessDesiredConfiguration = { revision: 'r1', entries: [] };

describe('extension device status', () => {
  it('summarises a host with one waiting item as ready with a count', () => {
    const status = deviceStatus(host([readiness('a', 'ready'), readiness('b', 'pending')]));
    expect(status.title).toBe('Ready · 1 item waiting');
    expect(status.current).toBe(true);
  });

  it('counts a host with waiting items among the ready devices', () => {
    const hosts = [host([readiness('a', 'ready'), readiness('b', 'missing')])];
    expect(devicesSummary(hosts)).toBe('1 ready · 0 waiting');
  });

  it('reports a host with nothing waiting as ready', () => {
    expect(deviceStatus(host([readiness('a', 'ready')])).title).toBe('Ready');
  });

  it('reads an item as ready when its own readiness is ready', () => {
    const configuration = {
      desired: DESIRED,
      hosts: [host([readiness('browser', 'ready'), readiness('skills', 'pending')])],
    };
    expect(itemSummary(item({}), configuration)).toBe('Ready on 1 device');
  });

  it('asks the owner to approve a plugin that runs programs before anything else', () => {
    const configuration = { desired: DESIRED, hosts: [] };
    expect(itemSummary(item({ executes: true, confirmed: false }), configuration)).toBe(
      'Needs your approval to run programs',
    );
  });
});

import { describe, expect, it } from 'vitest';
import type { AiHarnessHost } from '../src/ai-harness';
import {
  HARNESS_DESIRED_CONFIGURATION,
  HARNESS_PLUGIN_METADATA,
  deriveHarnessConfigurationHostStatus,
  type AiHarnessConfigurationStoredReport,
  type HarnessDesiredConfiguration,
} from '../src/ai-harness-configuration';

const RUNTIME = '3a000000-0000-4000-8000-0000000000a1';
const GENERATION = '3a000000-0000-4000-8000-0000000000b1';
const DEVICE = '3a000000-0000-4000-8000-0000000000c1';

const HOST: AiHarnessHost = {
  target: { kind: 'device', device_id: DEVICE },
  name: 'Laptop',
  online: true,
  configuration_sync: true,
  runtime_instance: RUNTIME,
  connection_generation: GENERATION,
  manifest: null,
  unavailable_reason: null,
  platform: 'linux',
};

const DESIRED: HarnessDesiredConfiguration = { revision: 'r2', entries: [] };

const REPORT: AiHarnessConfigurationStoredReport = {
  target: { kind: 'device', device_id: DEVICE },
  runtime_instance: RUNTIME,
  connection_generation: GENERATION,
  revision: 'r2',
  readiness: [],
  reported_at: '2026-10-08T07:00:00Z',
  received_at: '2026-10-08T07:00:01Z',
};

function freshness(
  host: Partial<AiHarnessHost>,
  report: AiHarnessConfigurationStoredReport | null,
): string {
  return deriveHarnessConfigurationHostStatus({ ...HOST, ...host }, DESIRED, report).freshness;
}

describe('deriveHarnessConfigurationHostStatus', () => {
  it('is unsupported for a host that does not take configuration, before looking at anything else', () => {
    expect(freshness({ configuration_sync: undefined, online: false }, null)).toBe('unsupported');
    expect(freshness({ configuration_sync: false }, REPORT)).toBe('unsupported');
  });

  it('is offline when the host is not connected and unreported when it never reported', () => {
    expect(freshness({ online: false }, REPORT)).toBe('offline');
    expect(freshness({}, null)).toBe('unreported');
  });

  it('is current only when the report matches the host connection and the desired revision', () => {
    expect(freshness({}, REPORT)).toBe('current');
  });

  it.each([
    { runtime_instance: '3a000000-0000-4000-8000-0000000000d1' },
    { connection_generation: '3a000000-0000-4000-8000-0000000000d2' },
    { revision: 'r1' },
    { pending_revision: 'r3' },
    { target: { kind: 'server' } as const },
  ])('is stale when the report differs by %j', (change) => {
    expect(freshness({}, { ...REPORT, ...change })).toBe('stale');
  });

  it('carries the identity of the host and the report it judged', () => {
    expect(deriveHarnessConfigurationHostStatus(HOST, DESIRED, REPORT)).toStrictEqual({
      target: HOST.target,
      online: true,
      runtime_instance: RUNTIME,
      connection_generation: GENERATION,
      report: REPORT,
      freshness: 'current',
    });
  });
});

describe('desired configuration', () => {
  it('refuses two entries with one id', () => {
    const entry = { id: 'a', package: 'p', version: '1', enabled: true, config: {} };
    expect(
      HARNESS_DESIRED_CONFIGURATION.safeParse({ revision: 'r', entries: [entry, entry] }).success,
    ).toBe(false);
    expect(
      HARNESS_DESIRED_CONFIGURATION.safeParse({
        revision: 'r',
        entries: [entry, { ...entry, id: 'b' }],
      }).success,
    ).toBe(true);
  });

  it('refuses repeated platforms and repeated skill assets in plugin metadata', () => {
    const metadata = {
      source: { kind: 'builtin', identity: 'x' },
      integrity: `sha256-${'A'.repeat(43)}=`,
      provenance: 'built in',
      platforms: ['linux'],
      dsh_version: '1',
      runtime_version: '1',
      server_safe: true,
      adapter: { id: 'a', version: '1', kind: 'tools' },
      skill_assets: [{ id: 's', version: '1' }],
    };
    expect(HARNESS_PLUGIN_METADATA.safeParse(metadata).success).toBe(true);
    expect(
      HARNESS_PLUGIN_METADATA.safeParse({ ...metadata, platforms: ['linux', 'linux'] }).success,
    ).toBe(false);
    expect(
      HARNESS_PLUGIN_METADATA.safeParse({
        ...metadata,
        skill_assets: [metadata.skill_assets[0], metadata.skill_assets[0]],
      }).success,
    ).toBe(false);
  });
});

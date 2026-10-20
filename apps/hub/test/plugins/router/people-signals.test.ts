import {
  PLUGIN_MANIFEST,
  pluginSignalSpec,
  signalRateOf,
  type PresencePerson,
  type RouterSnapshot,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { routerPlugin } from '../../../src/plugins/builtin/router';
import { routerMirror } from '../../../src/plugins/builtin/router/router-device';

const ANNA: PresencePerson = {
  id: '20000000-0000-4000-8000-000000000001',
  name: 'Anna',
  profile: false,
  tracked: true,
  home: true,
  since: '2026-10-18T08:00:00.000Z',
  viaPhone: false,
  devices: [],
};

const BOB: PresencePerson = {
  ...ANNA,
  id: '20000000-0000-4000-8000-000000000002',
  name: 'Bob',
  home: false,
};

const OFF: PresencePerson = {
  ...ANNA,
  id: '20000000-0000-4000-8000-000000000003',
  name: 'Off',
  tracked: false,
};

function snapshot(people: readonly PresencePerson[]): RouterSnapshot {
  return {
    at: '2026-10-18T08:00:00.000Z',
    connection: { state: 'online' },
    cadence: 'slow',
    intervalSeconds: 30,
    info: null,
    system: null,
    network: null,
    radios: [],
    stations: [],
    clients: [],
    people: [...people],
  };
}

describe('arrival and departure signals', () => {
  const spec = pluginSignalSpec(PLUGIN_MANIFEST.parse(routerPlugin.manifest));

  it('are automation triggers a person can be matched on, and reach the activity feed', () => {
    const arrived = spec.kinds.find((kind) => kind.kind === 'person_arrived');
    const left = spec.kinds.find((kind) => kind.kind === 'person_left');
    expect(arrived?.label).toBe('A person arrives home');
    expect(left?.label).toBe('A person leaves home');
    expect(arrived?.match.map((entry) => entry.key)).toEqual(['person_id', 'name', 'profile_id']);
    expect([arrived?.feed, left?.feed]).toEqual([true, true]);
  });

  it('are capped far below the general plugin cap so a flapping phone cannot storm automations', () => {
    expect(signalRateOf(spec.source, 'person_arrived')).toMatchObject({ perMinute: 6, burst: 3 });
    expect(signalRateOf(spec.source, 'person_left')).toMatchObject({ perMinute: 6, burst: 3 });
    expect(signalRateOf(spec.source, 'network_client_joined')?.perMinute).toBe(30);
  });
});

describe('router device presence readings', () => {
  const mirror = routerMirror({ push: () => undefined });

  it('expose each tracked person as a condition the automations can compare', () => {
    const current = snapshot([ANNA, BOB, OFF]);
    const keys = mirror.describe(current)?.capabilities.map((capability) => capability.key);
    expect(keys).toEqual(
      expect.arrayContaining(['raw:people_home', `raw:home_${ANNA.id}`, `raw:home_${BOB.id}`]),
    );
    expect(keys).not.toContain(`raw:home_${OFF.id}`);
    const readings = mirror.readings(current);
    expect(readings?.get('raw:people_home')).toBe(1);
    expect(readings?.get(`raw:home_${ANNA.id}`)).toBe(true);
    expect(readings?.get(`raw:home_${BOB.id}`)).toBe(false);
  });
});

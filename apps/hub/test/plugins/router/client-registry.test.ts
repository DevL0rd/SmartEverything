import type { NetworkClient } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { describe, expect, it } from 'vitest';
import { ClientRegistry } from '../../../src/plugins/builtin/router/client-registry';
import { memoryRecords } from '../memory-records';

const PHONE = 'aa:bb:cc:00:00:01';
const T0 = Date.parse('2026-10-18T08:00:00.000Z');
const GRACE_MS = 5 * 60 * 1000;

function at(offsetMs: number): Date {
  return new Date(T0 + offsetMs);
}

function client(connected: boolean): NetworkClient {
  return {
    mac: PHONE,
    name: 'Phone',
    ip: null,
    connection: connected ? 'wifi' : null,
    band: null,
    connected,
    blocked: false,
    trafficBytesPerSecond: null,
    profileId: null,
    personId: null,
    firstSeen: null,
    lastSeen: null,
  };
}

function registry(): ClientRegistry {
  return new ClientRegistry(memoryRecords(), () => undefined, new Logger('hub.router'));
}

describe('the router client registry', () => {
  it('keeps a connected client unchanged from one sample to the next', () => {
    const clients = registry();
    const first = clients.observe([client(true)], at(0));
    const later = clients.observe([client(true)], at(60_000));
    expect(later).toEqual(first);
    expect(later[0]?.lastSeen).toBe(at(0).toISOString());
    const known = clients.known()[0];
    clients.observe([client(true)], at(61_000));
    expect(clients.known()[0]).toBe(known);
  });

  it('marks the last time a client was connected once it drops off', () => {
    const clients = registry();
    clients.observe([client(true)], at(0));
    clients.observe([client(true)], at(30_000));
    const dropped = clients.observe([client(false)], at(31_000));
    expect(dropped[0]?.lastSeen).toBe(at(30_000).toISOString());
    const gone = clients.observe([], at(31_000 + GRACE_MS));
    expect(gone[0]).toMatchObject({ connected: false, lastSeen: at(30_000).toISOString() });
    expect(clients.known()[0]).toMatchObject({
      present: false,
      lastSeen: at(30_000).toISOString(),
    });
  });
});

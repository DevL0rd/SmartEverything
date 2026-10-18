import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isEventName } from '@smarteverything/logging';
import { describe, expect, it } from 'vitest';
import { HttpTally } from '../../src/server/http-tally';
import { RepeatGate } from '../../src/server/repeat-gate';
import { remoteKind, shapeOf } from '../../src/server/request-trace';

describe('RepeatGate', () => {
  it('lets the first hit through and counts what it suppresses until the interval passes', () => {
    let now = 0;
    const gate = new RepeatGate(1000, () => now);
    expect(gate.pass('a')).toBe(0);
    expect(gate.pass('a')).toBeNull();
    expect(gate.pass('a')).toBeNull();
    expect(gate.pass('b')).toBe(0);
    now = 1000;
    expect(gate.pass('a')).toBe(2);
    expect(gate.pass('a')).toBeNull();
  });

  it('forgets old keys instead of growing without bound', () => {
    const gate = new RepeatGate(1000, () => 0);
    for (let index = 0; index < 500; index += 1) gate.pass(String(index));
    expect(gate.pass('499')).toBeNull();
    expect(gate.pass('0')).toBe(0);
  });
});

describe('HttpTally', () => {
  it('summarises a window once and resets it', () => {
    const tally = new HttpTally();
    expect(tally.take()).toBeNull();
    tally.connected();
    tally.record({
      status: 200,
      durationMs: 10,
      aborted: false,
      route: 'GET /a',
      bytesIn: 1,
      bytesOut: 2,
    });
    tally.record({
      status: 503,
      durationMs: 1500,
      aborted: true,
      route: 'GET /b',
      bytesIn: 0,
      bytesOut: 0,
    });
    const taken = tally.take();
    expect(taken).toMatchObject({
      requests: 2,
      success: 1,
      serverError: 1,
      aborted: 1,
      slow: 1,
      maxMs: 1500,
      slowestRoute: 'GET /b',
      bytesOut: 2,
      sockets: 1,
    });
    expect(tally.take()).toBeNull();
  });
});

describe('request trace helpers', () => {
  it('classifies remote addresses without exposing them', () => {
    expect(remoteKind('127.0.0.1')).toBe('loopback');
    expect(remoteKind('::ffff:192.168.1.5')).toBe('private');
    expect(remoteKind('172.20.0.1')).toBe('private');
    expect(remoteKind('8.8.8.8')).toBe('public');
    expect(remoteKind(undefined)).toBe('unknown');
  });

  it('replaces identifier segments of an unmatched path', () => {
    expect(shapeOf('/api/things/123/0b1c2d3e-0000-4000-8000-000000000000/x')).toBe(
      '/api/things/:id/:id/x',
    );
  });
});

describe('hub server event names', () => {
  const files = [
    'server/http-server.ts',
    'server/http-observe.ts',
    'server/live.ts',
    'server/live-log.ts',
    'server/endpoint-log.ts',
    'server/auth.ts',
    'server/access.ts',
    'server/computer-socket.ts',
    'server/computer-log.ts',
    'server/camera-relay-log.ts',
    'server/node-socket.ts',
    'server/camera-socket.ts',
    'server/harness-socket.ts',
    'server/media-links.ts',
    'server/public-url.ts',
    'server/operations.ts',
    'network/connections.ts',
    'network/mdns-advertise.ts',
    'network/identity.ts',
  ];

  it('are all valid, so the logger can never throw on them', () => {
    const pattern = /\blog\s*\.\s*(?:trace|debug|info|warn|error|exception)\(\s*['`]([^'`]+)['`]/g;
    for (const file of files) {
      const text = readFileSync(join(__dirname, '../../src', file), 'utf8');
      for (const match of text.matchAll(pattern)) {
        const name = (match[1] ?? '')
          .replaceAll('${this.options.name}', 'talk')
          .replaceAll('${this.name}', 'talk')
          .replaceAll('${name}', 'talk');
        expect(isEventName(name), `${file}: ${name}`).toBe(true);
      }
    }
  });
});

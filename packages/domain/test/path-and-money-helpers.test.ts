import { describe, expect, it } from 'vitest';
import { USAGE_FILTER, microsOfUsd, usdOfMicros } from '../src/ai-usage';
import { matchPath } from '../src/api/endpoint';
import { harnessTargetKey } from '../src/ai-harness';
import { AI_HARNESS_HANDOFF_REQUEST } from '../src/ai-harness-session';
import { airBand } from '../src/presentation/air';
import { ruleSource, rulePort } from '../src/api/firewall';

describe('matchPath with a wildcard', () => {
  const PATTERN = '/api/ai/chats/:chatId/pages/:publicationId/*path';

  it('captures the rest of the path, including slashes, and decodes named parts', () => {
    expect(matchPath(PATTERN, '/api/ai/chats/c%201/pages/p1/dir/index.html')).toStrictEqual({
      chatId: 'c 1',
      publicationId: 'p1',
      path: 'dir/index.html',
    });
  });

  it('captures an empty rest and refuses a path that stops before the wildcard', () => {
    expect(matchPath(PATTERN, '/api/ai/chats/c/pages/p/')).toStrictEqual({
      chatId: 'c',
      publicationId: 'p',
      path: '',
    });
    expect(matchPath(PATTERN, '/api/ai/chats/c/pages')).toBeNull();
  });

  it('refuses a path whose fixed parts differ', () => {
    expect(matchPath(PATTERN, '/api/ai/chats/c/other/p/x')).toBeNull();
  });
});

describe('usage filter and money', () => {
  const FROM = '2026-10-08T00:00:00Z';
  const TO = '2026-10-09T00:00:00Z';

  it('needs the start to come before the end', () => {
    expect(USAGE_FILTER.safeParse({ from: FROM, to: TO }).success).toBe(true);
    expect(USAGE_FILTER.safeParse({ from: TO, to: FROM }).success).toBe(false);
    expect(USAGE_FILTER.safeParse({ from: FROM, to: FROM }).success).toBe(false);
  });

  it('converts between micro-dollars and dollars, rounding to a whole micro', () => {
    expect(usdOfMicros(2_500_000)).toBe(2.5);
    expect(microsOfUsd(2.5)).toBe(2_500_000);
    expect(microsOfUsd(0.0000004)).toBe(0);
    expect(microsOfUsd(0.0000006)).toBe(1);
  });
});

describe('harness targets', () => {
  const DEVICE = '3a000000-0000-4000-8000-0000000000a1';

  it('keys the server and a device apart', () => {
    expect(harnessTargetKey({ kind: 'server' })).toBe('server');
    expect(harnessTargetKey({ kind: 'device', device_id: DEVICE })).toBe(`device:${DEVICE}`);
  });

  it('keeps a handoff directory on the host the handoff goes to', () => {
    const base = {
      operation_id: '3a000000-0000-4000-8000-0000000000b1',
      route: {
        route_id: '3a000000-0000-4000-8000-0000000000c1',
        capability_revision: 'r',
        model: 'm',
        effort: null,
      },
    };
    const directory = { target: { kind: 'device', device_id: DEVICE }, path: '/home/me/project' };
    const parsed = AI_HARNESS_HANDOFF_REQUEST.safeParse({
      ...base,
      target: { kind: 'server' },
      directory,
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe(
      'The selected directory must belong to the target execution host.',
    );
    expect(
      AI_HARNESS_HANDOFF_REQUEST.safeParse({
        ...base,
        target: { kind: 'device', device_id: DEVICE },
        directory,
      }).success,
    ).toBe(true);
    expect(
      AI_HARNESS_HANDOFF_REQUEST.safeParse({ ...base, target: { kind: 'server' } }).success,
    ).toBe(true);
  });
});

describe('airBand', () => {
  it('bands fine particles by their upper limits and calls anything above them severe', () => {
    expect(airBand(0)).toBe('good');
    expect(airBand(1000)).toBe('severe');
  });
});

describe('firewall rule parts', () => {
  it('has no source for live video and no port for a camera', () => {
    const webrtc = { purpose: 'webrtc', protocol: 'tcp', port: 8555 } as const;
    const camera = { purpose: 'camera', protocol: 'udp', source: '192.168.1.20' } as const;
    expect(ruleSource(webrtc)).toBeNull();
    expect(rulePort(webrtc)).toBe(8555);
    expect(ruleSource(camera)).toBe('192.168.1.20');
    expect(rulePort(camera)).toBeNull();
  });
});

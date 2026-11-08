import { describe, expect, it } from 'vitest';
import { parseApkRequest, parseHubRequest, stepsCovered } from '../release-smoke.ts';

describe('the smoke command flags', () => {
  it('requires --above and a whole number for it', () => {
    expect(() => parseApkRequest({ file: 'a.apk' })).toThrow('usage');
    for (const bad of ['abc', '1.5', '-3', '']) {
      expect(() => parseApkRequest({ file: 'a.apk', above: bad })).toThrow();
    }
    expect(parseApkRequest({ file: 'a.apk', above: '29000000' }).above).toBe(29_000_000);
  });

  it('accepts the hub that the installer should update from and rejects anything else', () => {
    const request = parseApkRequest({
      file: 'a.apk',
      above: '1',
      server: 'https://hub.example.org',
    });
    expect(request.server).toBe('https://hub.example.org');
    expect(() => parseApkRequest({ file: 'a.apk', above: '1', server: 'not a url' })).toThrow();
  });

  it('validates the hub url and schema', () => {
    expect(parseHubRequest({ url: 'https://hub.example.org', schema: '7' }).schema).toBe(7);
    expect(() => parseHubRequest({ url: 'https://hub.example.org', schema: 'x' })).toThrow();
    expect(() => parseHubRequest({})).toThrow('usage');
  });

  it('describes the rollback step as the dry-run that now checks the backup', () => {
    const step = stepsCovered('manual').find((one) => one.id === 'hub-rollback');
    expect(step?.check).toContain('rollback --dry-run');
    expect(step?.check).not.toContain('on a copy');
  });
});

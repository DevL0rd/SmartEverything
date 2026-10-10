import { describe, expect, it } from 'vitest';
import { connectionPlanOf, serverHostOf } from './plan';

describe('which server this device talks to', () => {
  it('uses the local server on the desktop when its service is running or starting', () => {
    for (const health of ['running', 'starting'] as const) {
      expect(
        connectionPlanOf({ form: 'desktop', localServer: health, preferRemote: false }),
      ).toStrictEqual({ kind: 'local' });
    }
  });

  it('asks for a remote server on a desktop whose service is not running', () => {
    for (const health of ['not-installed', 'stopped', 'failed', null] as const) {
      expect(
        connectionPlanOf({ form: 'desktop', localServer: health, preferRemote: false }),
      ).toStrictEqual({ kind: 'stored', storage: 'browser' });
    }
  });

  it('keeps a desktop on the remote server it chose even when its own service runs', () => {
    expect(
      connectionPlanOf({ form: 'desktop', localServer: 'running', preferRemote: true }),
    ).toStrictEqual({ kind: 'stored', storage: 'browser' });
  });

  it('pairs Android through secure storage and a browser through its own storage', () => {
    expect(
      connectionPlanOf({ form: 'android', localServer: null, preferRemote: false }),
    ).toStrictEqual({ kind: 'stored', storage: 'phone' });
    expect(
      connectionPlanOf({ form: 'web', localServer: 'running', preferRemote: false }),
    ).toStrictEqual({ kind: 'stored', storage: 'browser' });
  });

  it('names a server by its host', () => {
    expect(serverHostOf('https://smarteverything.devl0rd.com')).toBe('smarteverything.devl0rd.com');
    expect(serverHostOf('http://127.0.0.1:47321')).toBe('127.0.0.1:47321');
  });
});

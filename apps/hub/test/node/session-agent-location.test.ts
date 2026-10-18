import { describe, expect, it } from 'vitest';
import { sessionAgentDirectory } from '../../src/node/session-agent/location';

const HOME = '/home/ann';

describe('where the session agent keeps its address', () => {
  it('uses the per-login runtime directory on Linux so nothing outlives the session', () => {
    expect(
      sessionAgentDirectory('linux', {
        runtimeDirectory: '/run/user/1000',
        localAppData: null,
        home: HOME,
      }),
    ).toBe('/run/user/1000/smarteverything');
  });

  it('has no place on Linux when nobody is logged in to a runtime directory', () => {
    expect(
      sessionAgentDirectory('linux', { runtimeDirectory: null, localAppData: null, home: HOME }),
    ).toBeNull();
  });

  it('uses the local app data on Windows and the application support folder on macOS', () => {
    expect(
      sessionAgentDirectory('win32', {
        runtimeDirectory: null,
        localAppData: 'C:\\Users\\ann\\AppData\\Local',
        home: HOME,
      }),
    ).toMatch(/SmartEverything[\\/]agent$/u);
    expect(
      sessionAgentDirectory('darwin', { runtimeDirectory: null, localAppData: null, home: HOME }),
    ).toBe('/home/ann/Library/Application Support/SmartEverything/agent');
  });

  it('gives the same place to every role of one user', () => {
    const environment = { runtimeDirectory: '/run/user/1000', localAppData: null, home: HOME };
    expect(sessionAgentDirectory('linux', environment)).toBe(
      sessionAgentDirectory('linux', { ...environment }),
    );
  });
});

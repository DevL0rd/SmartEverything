import { describe, expect, it } from 'vitest';
import {
  UnexpectedOutputError,
  launchdDetail,
  launchdRunning,
  parseLinger,
  parsePid,
  parseSystemdShow,
  systemdDetail,
} from '../src/service/parse.js';
import { parseRunValue } from '../src/service/windows-manager.js';

describe('systemd output', () => {
  it('reads the unit properties and describes them', () => {
    const state = parseSystemdShow(
      'LoadState=loaded\nActiveState=activating\nSubState=auto-restart\nResult=exit-code\n',
    );
    expect(state).toStrictEqual({
      loadState: 'loaded',
      activeState: 'activating',
      subState: 'auto-restart',
      result: 'exit-code',
    });
    expect(systemdDetail(state)).toBe(
      'systemd reports activating (auto-restart), last result exit-code',
    );
    expect(
      systemdDetail(parseSystemdShow('ActiveState=active\r\nSubState=running\r\nResult=success')),
    ).toBe('systemd reports active (running)');
    expect(parseSystemdShow('')).toStrictEqual({
      loadState: 'unknown',
      activeState: 'unknown',
      subState: 'unknown',
      result: 'unknown',
    });
  });
});

describe('launchd output', () => {
  const printed = [
    'gui/501/app.smarteverything.server = {',
    '\tstate = running',
    '\tlast exit code = 0',
    '}',
  ].join('\n');

  it('knows a running agent and describes its state', () => {
    expect(launchdRunning(printed)).toBe(true);
    expect(launchdRunning('\tstate = not running')).toBe(false);
    expect(launchdDetail(printed)).toBe('launchd reports running, last exit code 0');
    expect(launchdDetail('{}')).toBe('launchd reports no state');
  });
});

describe('loginctl and pid files', () => {
  it('reads lingering as yes or no and refuses anything else', () => {
    expect(parseLinger('yes\n')).toBe('enabled');
    expect(parseLinger('no')).toBe('disabled');
    expect(() => parseLinger('maybe')).toThrow(UnexpectedOutputError);
  });

  it('reads a positive pid or nothing', () => {
    expect(parsePid('42\n')).toBe(42);
    expect(parsePid(null)).toBeNull();
    expect(parsePid('zero')).toBeNull();
    expect(parsePid('-3')).toBeNull();
  });
});

describe('reg query output', () => {
  it('finds the SmartEverything value', () => {
    const output = [
      '',
      'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
      '    SmartEverything    REG_SZ    wscript.exe //B //Nologo "C:\\Data\\service-launch.js"',
      '',
    ].join('\r\n');
    expect(parseRunValue(output)).toBe('wscript.exe //B //Nologo "C:\\Data\\service-launch.js"');
    expect(parseRunValue('    SmartEverythingElse    REG_SZ    x')).toBeNull();
    expect(parseRunValue('    SmartEverything    REG_DWORD    0x1')).toBeNull();
  });
});

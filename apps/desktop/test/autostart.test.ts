import { describe, expect, it } from 'vitest';
import {
  AutostartArgumentError,
  autostartEntry,
  execLine,
  quoteExecArgument,
} from '../src/autostart.js';

describe('autostart entry', () => {
  it('quoteExecArgument leaves a plain argument bare', () => {
    expect(quoteExecArgument('/usr/lib/smarteverything/smarteverything')).toBe(
      '/usr/lib/smarteverything/smarteverything',
    );
  });

  it('quoteExecArgument quotes spaces and escapes the characters the spec reserves', () => {
    expect(quoteExecArgument('/opt/Smart Everything/run')).toBe('"/opt/Smart Everything/run"');
    expect(quoteExecArgument('a"b`c$d\\e')).toBe('"a\\"b\\`c\\$d\\\\e"');
    expect(quoteExecArgument('')).toBe('""');
  });

  it('execLine applies the string escape after quoting and doubles percent signs', () => {
    expect(execLine(['/opt/a b/run', '--hidden', '100%'])).toBe('"/opt/a b/run" --hidden 100%%');
    expect(execLine(['/opt/a\\b'])).toBe('"/opt/a\\\\\\\\b"');
  });

  it('quoteExecArgument refuses an argument that would break the entry onto a new line', () => {
    expect(() => quoteExecArgument('/bin/x\nExec=evil')).toThrow(AutostartArgumentError);
  });

  it('autostartEntry writes a desktop entry that starts hidden', () => {
    expect(autostartEntry('SmartEverything', ['/usr/bin/smarteverything', '--hidden'])).toBe(
      [
        '[Desktop Entry]',
        'Type=Application',
        'Version=1.0',
        'Name=SmartEverything',
        'Exec=/usr/bin/smarteverything --hidden',
        'Terminal=false',
        'X-GNOME-Autostart-enabled=true',
        '',
      ].join('\n'),
    );
  });
});

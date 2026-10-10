import { describe, expect, it } from 'vitest';
import {
  ServiceDefinitionError,
  systemdSystemTunnelUnit,
  systemdSystemUnit,
  systemdUnit,
} from '../src/service/definitions.js';
import {
  UnitUnreadableError,
  launchOfUserUnit,
  tunnelCommandOf,
} from '../src/system-migration/user-unit.js';
import { LAUNCH } from './support/fake-system.js';

const ACCOUNT = { user: 'ann', group: 'ann' };

describe('launchOfUserUnit', () => {
  it('reads back exactly the launch the desktop wrote, escapes included', () => {
    const tricky = {
      ...LAUNCH,
      executable: '/opt/100% "real"/$HOME\\app',
      path: '/a b:/c%d',
    };
    expect(launchOfUserUnit('u', systemdUnit(tricky))).toStrictEqual(tricky);
  });

  it('refuses a unit that was edited by hand', () => {
    expect(() => launchOfUserUnit('u', `${systemdUnit(LAUNCH)}# edited\n`)).toThrow(
      UnitUnreadableError,
    );
  });
});

describe('systemdSystemUnit', () => {
  it('runs the same launch as the owner before login', () => {
    const unit = systemdSystemUnit(LAUNCH, ACCOUNT);
    expect(unit).toContain('User=ann\nGroup=ann\n');
    expect(unit).toContain('After=network-online.target\n');
    expect(unit).toContain('WantedBy=multi-user.target\n');
    expect(unit).toContain(
      'ExecStart="/opt/SmartEverything/smarteverything" "/opt/SmartEverything/resources/service/service.mjs"',
    );
  });

  it('refuses an account name that is not plain', () => {
    expect(() => systemdSystemUnit(LAUNCH, { user: 'ann\nExecStartPre=x', group: 'ann' })).toThrow(
      ServiceDefinitionError,
    );
  });
});

describe('tunnelCommandOf', () => {
  it('expands %h because a system unit resolves it to root', () => {
    const user = '[Service]\nExecStart=/usr/bin/cloudflared --config %h/c.yml tunnel run\n';
    const command = tunnelCommandOf('t', user, '/home/ann');
    expect(command).toBe('/usr/bin/cloudflared --config /home/ann/c.yml tunnel run');
    expect(systemdSystemTunnelUnit(command, ACCOUNT)).toContain(`ExecStart=${command}\n`);
  });

  it('refuses other specifiers and several commands', () => {
    expect(() => tunnelCommandOf('t', 'ExecStart=/bin/x %u\n', '/h')).toThrow(UnitUnreadableError);
    expect(() => tunnelCommandOf('t', 'ExecStart=/bin/x\nExecStart=/bin/y\n', '/h')).toThrow(
      UnitUnreadableError,
    );
  });
});

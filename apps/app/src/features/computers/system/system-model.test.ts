import { describe, expect, it } from 'vitest';
import type { Battery, ServiceRow } from '@smarteverything/domain';
import {
  batteryView,
  hubServiceAsk,
  powerModeOptions,
  serviceGroups,
  serviceState,
  serviceSubtitle,
  serviceTitle,
  timerLine,
  usbLine,
} from './system-model';

function battery(patch: Partial<Battery>): Battery {
  return {
    level: 78,
    state: 'discharging',
    pluggedIn: false,
    minutesLeft: 130,
    healthPercent: 92,
    drawWatts: null,
    ...patch,
  };
}

function service(unit: string, system: boolean, description = ''): ServiceRow {
  return { unit, description, state: 'active', startsAtLogin: true, system };
}

describe('system model', () => {
  it('words the battery the way the design copy does', () => {
    expect(batteryView(battery({})).line).toBe('78 % · On battery · 2 h 10 min left · health 92 %');
    const charging = batteryView(battery({ state: 'charging', minutesLeft: 40, level: 50 }));
    expect(charging.state).toBe('Charging · full in 40 min');
    expect(charging.tone).toBe('positive');
  });

  it('turns a low battery on discharge critical', () => {
    expect(batteryView(battery({ level: 12 })).tone).toBe('critical');
    expect(batteryView(battery({ level: 12, state: 'charging' })).tone).toBe('positive');
  });

  it('offers only the power modes the computer lists', () => {
    expect(powerModeOptions(['balanced', 'performance'])).toEqual([
      { value: 'balanced', label: 'Balanced' },
      { value: 'performance', label: 'Performance' },
    ]);
  });

  it('words a service state and tells running from stopped', () => {
    expect(serviceState('active')).toEqual({ word: 'Running', tone: 'positive', running: true });
    expect(serviceState('failed').running).toBe(false);
    expect(serviceState('activating').running).toBe(true);
  });

  it('splits your services from system ones and sorts by unit', () => {
    const groups = serviceGroups([
      service('b.service', false),
      service('sshd.service', true),
      service('a.service', false),
    ]);
    expect(groups.yours.map((row) => row.unit)).toEqual(['a.service', 'b.service']);
    expect(groups.system.map((row) => row.unit)).toEqual(['sshd.service']);
  });

  it('titles a service by its description and keeps the unit as the subtitle', () => {
    expect(serviceTitle(service('a.service', false, 'Backup'))).toBe('Backup');
    expect(serviceSubtitle(service('a.service', false, 'Backup'))).toBe('a.service');
    expect(serviceTitle(service('a.service', false))).toBe('a.service');
    expect(serviceSubtitle(service('a.service', false))).toBeNull();
  });

  it('words the hub’s own service questions', () => {
    expect(hubServiceAsk('stop', 'Hub', 'Home hub')).toMatchObject({
      title: 'Stop Hub?',
      confirmLabel: 'Stop',
    });
    expect(hubServiceAsk('restart', 'Hub', 'Home hub').confirmLabel).toBe('Restart');
    expect(hubServiceAsk('disable', 'Hub', 'Home hub').confirmLabel).toBe('Turn off');
  });

  it('keeps a wattage figure and its unit together', () => {
    expect(batteryView(battery({ drawWatts: 18 })).line).toBe(
      '78 % · On battery · 2 h 10 min left · health 92 % · 18.0\u00A0W',
    );
  });

  it('words a timer and a USB device', () => {
    const now = Date.parse('2026-10-17T12:00:00.000Z');
    expect(
      timerLine({ unit: 'a.timer', description: '', nextRunAt: null, lastRunAt: null }, now),
    ).toBe('Not scheduled');
    expect(usbLine({ id: '1', name: 'Hub', vendor: 'Acme', speedMbps: 480 })).toBe(
      'Acme · 480 Mb/s',
    );
  });
});
